/**
 * Every check, in one list.
 *
 * The written process gives each check an id, the step it runs at, and whether
 * it blocks the next step or only warns. Holding them here rather than beside
 * the code that runs them means the list can be read in one sitting, and means
 * a step cannot quietly acquire a check nobody wrote down.
 *
 * `block` is not a severity word. A blocking check stops the next step from
 * starting: a document is not rendered while one fails. A warning is shown and
 * the work continues. Three sets of blocking checks are the gates - Gate A
 * before the SAP starts, Gate B before it is rendered, Gate C before the form
 * is.
 *
 * Most of these need no model. Forward, backward, adjustment, exploratory,
 * model, binary, repeated-measures, title-promise and number integrity are set
 * and graph operations over the stored objects, which is what makes them
 * testable without an API key.
 */

export type CheckStep =
  | "stage1"
  | "step1"
  | "step2"
  | "step3"
  | "step4"
  | "step5"
  | "step6"
  | "step7"
  | "step8"
  | "after8";

export type Check = {
  id: string;
  step: CheckStep;
  /** What must be true, in the words the failure will be reported in. */
  rule: string;
  type: "block" | "warn";
  /** The gate this check belongs to, where it is one. */
  gate?: "A" | "B" | "C";
};

export const CHECKS: Check[] = [
  /* ---- Gate A: the SAP cannot start until these are settled --------- */
  { id: "G-A1", step: "stage1", type: "block", gate: "A",
    rule: "The design is stated exactly, not as a timing word, and matches its reporting guideline." },
  { id: "G-A2", step: "stage1", type: "block", gate: "A",
    rule: "There is exactly one primary outcome, and every link of its outcome chain is filled." },
  { id: "G-A3", step: "stage1", type: "block", gate: "A",
    rule: "The groups are named and defined, and every primary and secondary outcome has a time point." },
  // Not in the written process. The process assumes the visit schedule and the
  // proforma are prose a human reads; here they are names code follows, and a
  // name that leads nowhere fails silently, which is the failure this whole
  // rebuild exists to stop.
  { id: "G-A4", step: "stage1", type: "block", gate: "A",
    rule: "Every measure named in the schedule, the outcomes, the covariates and the proforma is defined, with its unit or its categories." },

  /* ---- Step 1: objectives ------------------------------------------- */
  { id: "S1-1", step: "step1", type: "block",
    rule: "The printed label, PICOT or PECO, is the frame the Facts Sheet locked." },
  { id: "S1-2", step: "step1", type: "block",
    rule: "Every objective has an id, one outcome and one comparison, unless it is a safety objective." },
  { id: "S1-3", step: "step1", type: "block",
    rule: "Every word in the title that promises an analysis maps to an objective id, or to a TODO." },
  { id: "S1-4", step: "step1", type: "block",
    rule: "Every outcome measured more than once has both a level objective and a shape objective." },

  /* ---- Step 2: the master variable list ----------------------------- */
  { id: "S2-1", step: "step2", type: "block",
    rule: "Every primary and secondary outcome is a variable." },
  { id: "S2-2", step: "step2", type: "block",
    rule: "Every covariate of every planned adjusted model is a variable." },
  { id: "S2-3", step: "step2", type: "block",
    rule: "Every derived variable names its inputs, and every input is itself a variable." },
  { id: "S2-4", step: "step2", type: "block",
    rule: "Every categorical variable lists its options; every numerical variable has a unit." },
  { id: "S2-5", step: "step2", type: "block",
    rule: "Every variable serves an objective, a descriptive block or a population definition, or is administrative." },

  /* ---- Step 3: exploratory ------------------------------------------ */
  { id: "S3-1", step: "step3", type: "block",
    rule: "Every exploratory question reuses only variables already listed, or records a promotion with its reason." },

  /* ---- Step 4: the Analysis Map ------------------------------------- */
  { id: "S4-1", step: "step4", type: "block",
    rule: "Every primary and secondary objective maps to at least one table." },
  { id: "S4-2", step: "step4", type: "block",
    rule: "Every outcome has one unadjusted and one adjusted entry, or a written exception." },
  { id: "S4-3", step: "step4", type: "block",
    rule: "Every binary row states its frequency, measure, model and fallback, carries an absolute measure, and reports no odds ratio for a common outcome." },
  { id: "S4-4", step: "step4", type: "warn",
    rule: "The data-type cell states the unit of analysis and how many values each participant gives." },
  { id: "S4-5", step: "step4", type: "warn",
    rule: "The covariates are within the events-per-covariate cap, or the row says the analysis is unadjusted only." },
  // Not in the written process. From the model-choice deck's list of the eight
  // commonest mistakes: an ordered scale cut into two loses most of what was
  // measured, and the loss is invisible once the outcome is a yes or no.
  { id: "S4-6", step: "step4", type: "warn",
    rule: "No outcome dichotomises an ordered scale without the ordinal analysis beside it." },
  // Also not in the written process, and the one that changes an estimate
  // rather than a presentation: adjusting for something on the path from the
  // exposure to the outcome removes the very effect being measured.
  { id: "S4-7", step: "step4", type: "block",
    rule: "No adjusted model holds constant a variable measured after the exposure, which would be a mediator." },
  // The sample size assumed a result. A plan that estimates a different one has
  // either the wrong model or the wrong sample size, and neither is visible
  // from either section alone.
  { id: "S4-8", step: "step4", type: "warn",
    rule: "The effect the sample-size calculation assumed is the effect the primary analysis estimates." },

  /* ---- Step 5: rules ------------------------------------------------ */
  { id: "S5-1", step: "step5", type: "block",
    rule: "Every objective is assigned to an analysis population." },
  { id: "S5-2", step: "step5", type: "block",
    rule: "Every family present has its multiplicity line." },
  { id: "S5-3", step: "step5", type: "block",
    rule: "The interim rule is stated, or the plan says no interim analysis is planned." },

  /* ---- Step 6: the shell tables ------------------------------------- */
  { id: "S6-1", step: "step6", type: "block",
    rule: "Every value cell is blank." },
  { id: "S6-2", step: "step6", type: "block",
    rule: "Every table has its title line and its footnote line." },
  { id: "S6-3", step: "step6", type: "block",
    rule: "The sensitivity table is the last table of the primary block." },
  { id: "S6-4", step: "step6", type: "block",
    rule: "Every model table has a fit table after it, and every adjusted table has an overlap table before it." },
  { id: "S6-5", step: "step6", type: "block",
    rule: "No per-time-point table has a p column, and no baseline table of a randomised trial has one." },
  { id: "S6-6", step: "step6", type: "block",
    rule: "The pinned table count equals the number of tables drawn." },

  /* ---- Step 7, Gate B: traceability --------------------------------- */
  { id: "S7-1", step: "step7", type: "block", gate: "B",
    rule: "Forward: every objective id points to at least one shell table." },
  { id: "S7-2", step: "step7", type: "block", gate: "B",
    rule: "Backward: every variable appears in at least one table, or it is a missing analysis or an unneeded capture." },
  { id: "S7-3", step: "step7", type: "block", gate: "B",
    rule: "Adjustment integrity: every covariate of every adjusted model is in the variable list." },
  { id: "S7-4", step: "step7", type: "block", gate: "B",
    rule: "Exploratory integrity: no exploratory table uses a variable outside the list, unless it was promoted." },
  { id: "S7-5", step: "step7", type: "block", gate: "B",
    rule: "Placement integrity: sensitivity closes the primary block, every family heading carries its note line, and the primary block opens with its population line." },
  { id: "S7-6", step: "step7", type: "block", gate: "B",
    rule: "Population integrity: the primary population is named on the primary tables, and a non-inferiority trial shows both the intention-to-treat and the per-protocol set." },
  { id: "S7-8", step: "step7", type: "block", gate: "B",
    rule: "Model integrity: every model table has a fit table, every adjusted table has an overlap table before it, and each outcome has one adjustment set." },
  { id: "S7-9", step: "step7", type: "block", gate: "B",
    rule: "Binary integrity: every binary row states frequency, measure, model and fallback; every ratio has its absolute difference; no odds ratio stands for a common outcome." },
  { id: "S7-10", step: "step7", type: "block", gate: "B",
    rule: "Repeated-measures integrity: every repeated outcome has a level and a shape analysis, and no per-time-point table carries a p column." },
  { id: "S7-11", step: "step7", type: "block", gate: "B",
    rule: "Title-promise integrity: every word in the title that promises an analysis maps to a table." },
  { id: "S7-12", step: "step7", type: "block", gate: "B",
    rule: "Number integrity: the table numbers in the Analysis Map match Section 6, and the pinned count matches the tables drawn." },

  /* ---- Step 8: the form --------------------------------------------- */
  { id: "CRF-1", step: "step8", type: "block",
    rule: "Numbering restarts at 1 in every section, every section has a heading, no response is pre-filled, and no continuous variable is banded." },
  { id: "CRF-2", step: "step8", type: "warn",
    rule: "Option wording is taken from the fixed terminology list." },

  /* ---- Gate C: the form against the tables --------------------------- */
  { id: "C7-1", step: "after8", type: "block", gate: "C",
    rule: "Not less: every raw variable a table needs has a field, at every time point the table needs it." },
  { id: "C7-2", step: "after8", type: "block", gate: "C",
    rule: "Not extra: every field that is not capture infrastructure traces to a table, or to a raw part of a derived value a table needs." },
  { id: "C7-3", step: "after8", type: "block", gate: "C",
    rule: "Every adjustment covariate and every stratifier used in an adjusted table has a field." },
  { id: "C7-4", step: "after8", type: "block", gate: "C",
    rule: "No derived value is captured as a field; its raw inputs are." },
];

const BY_ID = new Map(CHECKS.map((check) => [check.id, check]));

export function checkById(id: string): Check | undefined {
  return BY_ID.get(id);
}

export function checksAt(step: CheckStep): Check[] {
  return CHECKS.filter((check) => check.step === step);
}

/** The checks a gate is made of. Nothing passes the gate while one fails. */
export function checksAtGate(gate: "A" | "B" | "C"): Check[] {
  return CHECKS.filter((check) => check.gate === gate);
}
