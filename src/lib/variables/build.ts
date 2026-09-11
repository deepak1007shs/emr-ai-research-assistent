import type {
  FactsSheet,
  Objective,
  Timepoint,
  Variable,
  VariableName,
} from "../study/types.ts";
import type { Role } from "../study/vocabulary.ts";
import { chainOfObjective } from "../objectives/build.ts";
import {
  anchorOf,
  groupWord,
  indexTestsOf,
  isDiagnostic,
  referenceOf,
} from "../study/diagnostic.ts";

/**
 * Step 2: the master variable list, built from the dictionary and the
 * objectives.
 *
 * Nothing here asks a model anything. The Facts Sheet already says what the
 * study records, of what type, in what unit and with which categories; the
 * objectives already say which of those are outcomes and which are held
 * constant. What is left is bookkeeping, and bookkeeping is what code is for.
 *
 * The one thing this refuses to do is invent. A measure that serves nothing
 * gets a note the investigator has to answer, not a role chosen to make the
 * list look complete. That distinction is the difference between a plan and a
 * plausible document.
 */

/** The key roles are stored under when they belong to the study, not a question. */
export const STUDY = "study";

/** The name of the variable holding which group a person is in. */
export const ARM = "arm";

/** The two words a derived yes-or-no outcome is written in, in this order. */
const YES_NO = ["Yes", "No"];

export type VariableList = {
  variables: Variable[];
  /** What the investigator has to answer. Never guessed away. */
  todos: string[];
};

const NUMERIC = ["continuous", "count", "time_to_event"];

/** The visits a measure is recorded at, read off the schedule. */
function visitsOf(facts: FactsSheet, name: VariableName): Timepoint[] {
  return facts.visit_schedule
    .filter((visit) => visit.measures.includes(name))
    .map((visit) => visit.timepoint);
}

/** The visits every input of a computed measure is available at. */
function inputVisits(facts: FactsSheet, measure: { derived_from: string[] }) {
  const perInput = measure.derived_from.map((input) => visitsOf(facts, input));
  if (!perInput.length) return [];
  return perInput[0].filter((visit) =>
    perInput.every((visits) => visits.includes(visit)),
  );
}

/**
 * The categories of a derived categorical outcome.
 *
 * A derived yes-or-no takes the house wording. Anything else is left empty on
 * purpose: check S2-4 then reports it and the investigator supplies the
 * categories. Splitting the outcome's unit on a slash would work for
 * "Yes / No" and would quietly produce nonsense for a grade written
 * "0 (none) to 3 (severe)", which is the failure this whole rebuild exists to
 * stop.
 */
function derivedOptions(
  type: string,
  inputs: { type: string; options: string[] | null }[],
): string[] | null {
  // An outcome that is one measure reported at one visit has that measure's
  // categories: "Functional outcome on the modified Rankin scale" is the
  // Rankin score, and its rows are 0 to 5. Inherited only where the input is
  // the same kind of thing, so that a yes-or-no computed from a laboratory
  // value does not acquire the laboratory value's categories.
  const [only] = inputs;
  if (inputs.length === 1 && only.type === type && only.options?.length) {
    return [...only.options];
  }
  if (type === "binary") return [...YES_NO];
  // Anything else is left empty on purpose: check S2-4 reports it and the
  // investigator supplies the categories. Splitting the outcome's unit on a
  // slash would work for "Yes / No" and would quietly produce nonsense for a
  // grade written "0 (none) to 3 (severe)".
  return null;
}

export function buildVariables(
  facts: FactsSheet,
  objectives: Objective[],
): VariableList {
  const variables: Variable[] = [];
  const todos: string[] = [];
  const byName = new Map<VariableName, Variable>();

  const push = (variable: Variable) => {
    variables.push(variable);
    byName.set(variable.name, variable);
  };

  /* ---- the group a person is in ------------------------------------ */
  // In a diagnostic accuracy study the groups are the reference standard's two
  // results, and the reference standard is already a measure. A second
  // variable holding the same thing is a field somebody fills in twice.
  const diagnostic = isDiagnostic(facts);
  const groupsAreAMeasure =
    diagnostic && referenceOf(facts, facts.primary) !== null;
  if (facts.groups.length >= 2 && !groupsAreAMeasure) {
    const word = groupWord(facts);
    push({
      name: ARM,
      label: word === "arm" ? "Trial arm" : word[0].toUpperCase() + word.slice(1),
      roles: {},
      type: "nominal",
      unit: null,
      options: facts.groups.map((group) => group.label),
      timepoints: [facts.timepoints[0] ?? ""].filter(Boolean),
      derived_from: [],
      recipe: null,
      crf: true,
      source: "protocol",
    });
  }

  /* ---- one variable per measure ------------------------------------ */
  for (const measure of facts.measures) {
    push({
      name: measure.name,
      label: measure.label,
      roles: {},
      type: measure.type,
      unit: measure.unit,
      options: measure.options,
      // A computed measure exists wherever its inputs do, and is written on
      // no form.
      timepoints: measure.derived_from.length
        ? inputVisits(facts, measure)
        : visitsOf(facts, measure.name),
      derived_from: [...measure.derived_from],
      recipe: measure.recipe,
      crf: measure.derived_from.length === 0,
      source: "protocol",
    });
  }

  /* ---- one variable per outcome that is not itself a measure -------- */
  // A diagnostic study's outcomes are relations among measures, and its anchor
  // is one of them, so nothing is derived. See `study/diagnostic.ts`.
  for (const outcome of [facts.primary, ...facts.secondary]) {
    const name = anchorOf(facts, outcome);
    if (byName.has(name)) continue;
    push({
      name,
      label: outcome.what,
      roles: {},
      type: outcome.type,
      unit: NUMERIC.includes(outcome.type) ? outcome.unit : null,
      options: derivedOptions(
        outcome.type,
        outcome.measures
          .map((name) => byName.get(name))
          .filter((v): v is Variable => Boolean(v)),
      ),
      // The reading happens four times; the change happens once, at the end
      // of the window the recipe spans. A derived variable carrying every
      // visit its inputs were taken at would put a change column under day 0.
      timepoints: outcome.time.slice(-1),
      derived_from: [...outcome.measures],
      recipe: outcome.how,
      // A derived value is never collected. Rule R6, and check 7 depends on it.
      crf: false,
      source: "protocol",
    });
  }

  /* ---- the roles each question gives each variable ------------------ */
  for (const objective of objectives.filter((o) => o.family !== "exploratory")) {
    const outcome = byName.get(objective.outcome);
    if (outcome) outcome.roles[objective.id] = "outcome";

    // Every input of that outcome is there to make it.
    for (const input of outcome?.derived_from ?? []) {
      const raw = byName.get(input);
      if (raw && !raw.roles[objective.id]) raw.roles[objective.id] = "derived";
    }

    const arm = byName.get(ARM);
    if (arm) arm.roles[objective.id] = "exposure";

    // What a diagnostic question evaluates: its index tests, and for a
    // comparison of index values, the reference result they are split by.
    const chain = diagnostic ? chainOfObjective(facts, objective.id) : null;
    if (chain) {
      const evaluated = [...indexTestsOf(facts, chain)];
      const reference = referenceOf(facts, chain);
      if (reference && reference !== objective.outcome) evaluated.push(reference);
      for (const name of evaluated) {
        const variable = byName.get(name);
        if (variable && !variable.roles[objective.id]) {
          variable.roles[objective.id] = "exposure";
        }
      }
    }
  }

  /* ---- what the adjusted models hold constant ----------------------- */
  // A diagnostic accuracy study fits no adjusted model: how well a test finds
  // a condition is estimated, not adjusted. Giving its covariates that role
  // asked the investigator to confirm them "as covariates of the adjusted
  // models" that do not exist.
  const modelled = objectives.filter((o) => o.family !== "exploratory");
  for (const covariate of diagnostic ? [] : facts.covariates) {
    const variable = byName.get(covariate.measure);
    if (!variable) continue;
    for (const objective of modelled) {
      // A variable is not a covariate of the question it is the outcome of.
      if (variable.roles[objective.id] === "outcome") continue;
      variable.roles[`adjust:${objective.id}`] = "covariate";
    }
    if (covariate.inferred) {
      todos.push(
        `Confirm ${variable.label} as a covariate of the adjusted models. It was inferred from the design, not named in the protocol.`,
      );
    }
  }

  /* ---- what the proforma triage said each item was for -------------- */
  const purposeRole: Record<string, Role> = {
    administrative: "administrative",
    descriptor: "descriptor",
    population: "population_definition",
    input: "derived",
  };
  for (const item of facts.proforma) {
    if (!item.keep || !item.measure || !item.purpose) continue;
    const variable = byName.get(item.measure);
    if (!variable) continue;
    variable.roles[STUDY] = purposeRole[item.purpose];
    // An input whose output nothing defines is a field somebody fills in for
    // every participant that feeds a number nobody will ever compute.
    const feeds = facts.measures.some((m) =>
      m.derived_from.includes(variable.name),
    );
    if (item.purpose === "input" && !feeds) {
      todos.push(
        `${variable.label} is kept as a raw input of a derived variable the protocol does not define. Name that variable, with its formula, or drop ${variable.label.toLowerCase()}.`,
      );
    }
  }

  /* ---- what the exploratory questions are about --------------------- */
  // The roles, here with every other role. What Step 3 does with them - the
  // promotion of a variable the study never collects - is a change to the
  // list, and it needs the list to exist first.
  const exploratoryRole: Record<string, Role> = {
    subgroup: "exposure",
    interaction: "exposure",
    correlation: "exposure",
    derivation: "derived",
  };
  const exploratoryObjectives = objectives.filter(
    (o) => o.family === "exploratory",
  );
  facts.exploratory_ideas.forEach((idea, index) => {
    const objective = exploratoryObjectives[index];
    if (!objective) return;
    const outcome = byName.get(idea.outcome_of);
    if (outcome) outcome.roles[objective.id] = "outcome";
    for (const name of idea.with) {
      const variable = byName.get(name);
      if (variable) variable.roles[objective.id] = exploratoryRole[idea.kind];
    }
    if (idea.kind === "subgroup" || idea.kind === "interaction") {
      const arm = byName.get(ARM);
      if (arm) arm.roles[objective.id] = "exposure";
    }
  });

  const first = facts.timepoints[0];
  for (const variable of variables) {
    if (Object.keys(variable.roles).length > 0) continue;
    const baselineOnly =
      variable.timepoints.length === 1 && variable.timepoints[0] === first;
    variable.roles[STUDY] = "descriptor";
    if (!baselineOnly) {
      todos.push(
        `${variable.label} is recorded at ${variable.timepoints.join(", ") || "no visit"} and answers no objective. It is reported in the descriptive block for now. Say which question it serves, or drop it.`,
      );
    }
  }

  return { variables, todos };
}
