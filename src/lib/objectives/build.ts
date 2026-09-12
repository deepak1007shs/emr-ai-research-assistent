import type {
  FactsSheet,
  VariableName,
  Objective,
  OutcomeChain,
  Picot,
  PicotRow,
} from "../study/types.ts";
import type { DataType } from "../study/vocabulary.ts";
import { anchorOf } from "../study/diagnostic.ts";

/**
 * The outcome an objective was written from, by its id.
 *
 * The inverse of how the ids are given: P1, P1a and P1b are the primary; S2,
 * S2a and S2b are the second secondary. It is read from the id and not from
 * the variable because in a diagnostic study several objectives are about the
 * same variable - the reference standard - and asking "which outcome is this
 * variable's" returned the primary for all of them, so every secondary took the
 * primary's index tests. Exploratory objectives have no outcome chain of their
 * own and return null.
 */
export function chainOfObjective(facts: FactsSheet, id: string): OutcomeChain | null {
  if (/^P1[ab]?$/.test(id)) return facts.primary;
  const secondary = /^S(\d+)[ab]?$/.exec(id);
  if (secondary) return facts.secondary[Number(secondary[1]) - 1] ?? null;
  return null;
}

/**
 * Step 1: the question decomposed, and every objective written as a question.
 *
 * Derived from the Facts Sheet rather than asked for again. A question forces
 * whoever reads it to name an outcome and a comparison, and the outcome chain
 * already holds both, so the wording comes from a template with slots. That is
 * what stops the same protocol producing "to compare the efficacy" one run and
 * a real question the next.
 *
 * The ids are fixed here and never change. Steps 2 to 8 refer to them, and an
 * id that moved would break every link in the plan at once.
 */

/** A name mid-sentence: "Change in haemoglobin" becomes "change in haemoglobin". */
const lower = (text: string) =>
  text && text[0] === text[0].toUpperCase() && !/^[A-Z]{2,}/.test(text)
    ? text[0].toLowerCase() + text.slice(1)
    : text;

/** How a visit is written in prose: "Week 6" for the code "W6". */
export function visitLabel(facts: FactsSheet, code: string): string {
  return (
    facts.visit_schedule.find((visit) => visit.timepoint === code)?.label ?? code
  );
}

/** "Day 0, Week 2, Week 4 and Week 6", in the order they happen. */
function visitList(facts: FactsSheet, times: string[]): string {
  const labels = times.map((code) => visitLabel(facts, code));
  if (labels.length <= 1) return labels[0] ?? "";
  return `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`;
}

/**
 * An outcome that owes a shape question as well as a level one.
 *
 * Three or more readings of a value that moves. Not a binary event recorded at
 * three visits: "any adverse effect" is counted once per person however many
 * visits asked about it, and a trajectory of a yes/no is not a thing the study
 * measures. Decision table B has repeated branches for continuous and ordinal
 * outcomes and for no others, which is the same line drawn from the other side.
 */
export function isRepeated(outcome: OutcomeChain): boolean {
  const movesOverTime: DataType[] = ["continuous", "ordinal", "count"];
  return outcome.time.length >= 3 && movesOverTime.includes(outcome.type);
}

/* ---- the question templates ----------------------------------------- */

function comparison(facts: FactsSheet): string {
  const [a, b] = facts.groups;
  if (!a || !b) return "";
  return `${a.label} and ${b.label}`;
}

/** "duration of ischaemia, mechanism of injury and anatomical level". */
function factors(outcome: OutcomeChain, facts: FactsSheet): string {
  const labels = outcome.exposures.map((exposure) => {
    const measure = facts.measures.find((m) => m.name === exposure.measure);
    return lower(measure?.label ?? exposure.measure.replace(/_/g, " "));
  });
  if (labels.length <= 1) return labels[0] ?? "";
  return `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`;
}

/** The covariates an adjusted model holds constant, for the question's tail. */
function heldConstant(facts: FactsSheet, outcome: OutcomeChain): string {
  const exposures = new Set(outcome.exposures.map((e) => e.measure));
  // What this objective holds constant, which is what its model fits. Reading
  // the Facts Sheet's global list here while Step 4 read the outcome's own
  // made the question promise eleven confounders and the model fit four.
  const named = outcome.covariates.length ? outcome.covariates : facts.covariates;
  const labels = named
    .filter((covariate) => !exposures.has(covariate.measure))
    .map((covariate) => {
      const measure = facts.measures.find((m) => m.name === covariate.measure);
      return lower(measure?.label ?? covariate.measure.replace(/_/g, " "));
    });
  if (!labels.length) return "";
  if (labels.length === 1) return labels[0];
  return `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`;
}

/**
 * The level question: is the value different between the groups?
 *
 * Three questions, not one, and which it is comes from the outcome rather than
 * from the number of arms. A study with no arms used to be asked "What is the
 * proportion with amputation?", which is a prevalence survey's question, on a
 * protocol whose title is "factors affecting the rates of amputations".
 */
function levelQuestion(outcome: OutcomeChain, facts: FactsSheet): string {
  const between = comparison(facts);
  const subject =
    outcome.type === "binary"
      ? `the proportion with ${lower(outcome.what)}`
      : outcome.type === "count"
        ? `the number of ${lower(outcome.what)}`
        : outcome.type === "time_to_event"
          ? `the time to ${lower(outcome.what)}`
          : lower(outcome.what);

  if (outcome.kind === "accuracy" && outcome.exposures.length) {
    // What is identified is the condition, which is the measure the outcome is
    // read against - not the outcome's own wording. An outcome written
    // "diagnostic accuracy of MESS and GANGA for predicting amputation" asked
    // how well MESS and GANGA identify the diagnostic accuracy of MESS and
    // GANGA.
    const condition = facts.measures.find((m) => m.name === outcome.measures[0]);
    return `How well do ${factors(outcome, facts)} identify ${lower(condition?.label ?? outcome.what)}?`;
  }

  if (outcome.kind === "association" && outcome.exposures.length) {
    const adjusted = heldConstant(facts, outcome);
    const tail = adjusted ? `, after adjustment for ${adjusted}` : "";
    return `Is ${lower(outcome.what)} associated with ${factors(outcome, facts)}${tail}?`;
  }

  return between
    ? `Is ${subject} different between ${between}?`
    : `What is ${subject}?`;
}

/**
 * What the shape question is about.
 *
 * The thing whose trajectory is being asked about is the measure, not the
 * derived value. The primary outcome is written "Change in haemoglobin", and
 * "the rate of change in change in haemoglobin" is not a sentence. A change is
 * one number per person; a trajectory is the readings it was computed from.
 */
function shapeSubject(outcome: OutcomeChain, facts: FactsSheet): string {
  if (outcome.measures.length !== 1) return lower(outcome.what);
  const measure = facts.measures.find((m) => m.name === outcome.measures[0]);
  return measure ? lower(measure.label) : lower(outcome.what);
}

/** The shape question: is the rate of change different between the groups? */
function shapeQuestion(outcome: OutcomeChain, facts: FactsSheet): string {
  const between = comparison(facts);
  const across = visitList(facts, outcome.time);
  const subject = shapeSubject(outcome, facts);
  return between
    ? `Is the rate of change in ${subject} across ${across} different between ${between}?`
    : `How does ${subject} change across ${across}?`;
}

/* ---- PICOT ----------------------------------------------------------- */

/**
 * The frame, with the letter the design owes.
 *
 * The letter stays I in both frames and the word follows the design: a trial
 * assigns an intervention, an observational study finds an exposure.
 */
export function buildPicot(facts: FactsSheet): Picot {
  const second = facts.frame === "PICO" ? "Intervention" : "Exposure";
  const outcomes = [facts.primary, ...facts.secondary];
  const secondary = outcomes
    .slice(1)
    .map((o) => lower(o.what))
    .join(", ");

  const rows: PicotRow[] = [
    {
      letter: "P",
      element: "Population",
      value: `${facts.population.eligibility} Setting: ${facts.population.setting}. Sampling: ${facts.population.sampling}.`.trim(),
    },
    { letter: "I", element: second, value: facts.intervention },
    { letter: "C", element: "Comparator", value: facts.comparator },
    {
      letter: "O",
      element: "Outcome",
      value: `${facts.primary.what} (${facts.primary.unit}, ${facts.primary.instrument})${
        secondary ? `; secondarily ${secondary}` : ""
      }`,
    },
    {
      letter: "T",
      element: "Time / Type of study",
      value: `${visitList(facts, facts.timepoints)}. Type: ${facts.design_label}`,
    },
  ];

  const between = comparison(facts);
  const last = facts.timepoints[facts.timepoints.length - 1];
  const by = last ? ` by ${lower(visitLabel(facts, last))}` : "";
  const assembled = between
    ? `Among ${lower(facts.population.short)}, does ${lower(facts.intervention)}, compared with ${lower(facts.comparator)}, produce a different ${lower(facts.primary.what)}${by}?`
    : `Among ${lower(facts.population.short)}, what is ${lower(facts.primary.what)}${by}?`;

  return {
    frame: facts.frame,
    rows,
    assembled_question: assembled,
    aim: facts.aim,
    // Never invented. A protocol with no hypothesis says so, and a plan that
    // supplies one has written the investigator's expectation for them.
    hypothesis: facts.hypothesis ?? "Not stated in the protocol.",
  };
}

/* ---- the objectives -------------------------------------------------- */

/**
 * Every objective, with its id.
 *
 * Primary first, then secondary in the order the Facts Sheet lists them, then
 * exploratory. A repeated outcome takes two ids, `a` for the level and `b` for
 * the shape, so a reader citing P1b is citing the rate of change and nothing
 * else.
 */
export function buildObjectives(facts: FactsSheet): Objective[] {
  const out: Objective[] = [];

  const add = (
    id: string,
    family: Objective["family"],
    kind: Objective["kind"],
    outcome: OutcomeChain,
    question: string,
    variable: VariableName,
    source: Objective["source"] = "objective",
  ) => {
    out.push({
      id,
      family,
      kind,
      question,
      outcome: variable,
      comparison: comparison(facts) || "single group",
      source,
      todo: [],
    });
  };

  const forOutcome = (
    outcome: OutcomeChain,
    family: Objective["family"],
    stem: string,
  ) => {
    // The variable the question is about. For most designs, the outcome's own
    // name, which Step 2 makes into a variable; for a diagnostic study, the
    // measure the question is anchored on. See `study/diagnostic.ts`.
    const derived = anchorOf(facts, outcome);
    // The shape question is asked of the readings, so it is linked to them.
    const raw = outcome.measures.length === 1 ? outcome.measures[0] : derived;

    if (isRepeated(outcome)) {
      add(`${stem}a`, family, "level", outcome, levelQuestion(outcome, facts), derived);
      add(`${stem}b`, family, "shape", outcome, shapeQuestion(outcome, facts), raw);
    } else {
      add(stem, family, "single", outcome, levelQuestion(outcome, facts), derived);
    }
  };

  forOutcome(facts.primary, "primary", "P1");
  facts.secondary.forEach((outcome, i) => {
    forOutcome(outcome, "secondary", `S${i + 1}`);
  });

  // The ideas the protocol raised without making them objectives. They keep
  // their own wording because an idea stated in a hypothesis is a sentence, not
  // a slot, and a template that reworded it would lose what was asked.
  //
  // Their outcome is left empty here on purpose. An exploratory question can be
  // a subgroup of the primary, a correlation between two secondaries, or a
  // variable the protocol has not collected at all, and only Step 3 knows
  // which. Pointing all of them at the primary would give the primary outcome
  // roles in questions that are not about it.
  facts.exploratory_ideas.forEach((idea, i) => {
    out.push({
      id: `E${i + 1}`,
      family: "exploratory",
      kind: "single",
      question: idea.question.trim().endsWith("?")
        ? idea.question.trim()
        : `${idea.question.trim()}?`,
      outcome: "",
      comparison: comparison(facts) || "single group",
      source: "hypothesis",
      todo: [],
    });
  });

  return out;
}
