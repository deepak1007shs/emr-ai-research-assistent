import type {
  FactsSheet,
  Objective,
  Timepoint,
  Variable,
  VariableName,
} from "../study/types.ts";
import type { Role } from "../study/vocabulary.ts";
import { variableName } from "./name.ts";

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
const CATEGORICAL = ["binary", "nominal", "ordinal"];

/** The visits a measure is recorded at, read off the schedule. */
function visitsOf(facts: FactsSheet, name: VariableName): Timepoint[] {
  return facts.visit_schedule
    .filter((visit) => visit.measures.includes(name))
    .map((visit) => visit.timepoint);
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
function derivedOptions(type: string): string[] | null {
  if (type === "binary") return [...YES_NO];
  return CATEGORICAL.includes(type) ? null : null;
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
  if (facts.groups.length >= 2) {
    push({
      name: ARM,
      label: "Trial arm",
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
      timepoints: visitsOf(facts, measure.name),
      derived_from: [],
      recipe: null,
      crf: true,
      source: "protocol",
    });
  }

  /* ---- one variable per outcome that is not itself a measure -------- */
  for (const outcome of [facts.primary, ...facts.secondary]) {
    const name = variableName(outcome.what);
    if (byName.has(name)) continue;
    push({
      name,
      label: outcome.what,
      roles: {},
      type: outcome.type,
      unit: NUMERIC.includes(outcome.type) ? outcome.unit : null,
      options: derivedOptions(outcome.type),
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
  }

  /* ---- what the adjusted models hold constant ----------------------- */
  const modelled = objectives.filter((o) => o.family !== "exploratory");
  for (const covariate of facts.covariates) {
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
    if (item.purpose === "input") {
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
