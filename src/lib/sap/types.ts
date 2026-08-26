/**
 * The analysis model behind the Statistical Analysis Plan.
 *
 * This object owns the registries. Every variable and every outcome is declared
 * once, with an id and a single authoritative label, and the case report form
 * and the shell tables refer to those ids rather than repeating the words. Two
 * documents cannot disagree about a string that exists in one place.
 */

export type DataType =
  | "binary" | "continuous" | "ordinal" | "nominal" | "count" | "time_to_event";

/** What is being compared, which with the data type decides the test. */
export type Comparison =
  | "single_group"      // one proportion or one mean, estimated
  | "two_groups"        // converted versus completed
  | "many_groups"       // three or more
  | "association"       // outcome regressed on predictors
  | "adjusted"          // the same, with confounders held constant
  | "paired"            // before and after in the same patient
  | "correlation"
  | "agreement"
  | "descriptive";      // frequencies, no test

export type Role =
  | "outcome" | "predictor" | "confounder" | "effect_modifier"
  | "mediator" | "collider" | "descriptor";

/** The second classification every outcome carries, from the teaching slide. */
export type Domain =
  | "clinical" | "laboratory" | "radiological" | "functional"
  | "patient_reported" | "economic" | "composite";

export type Objective = {
  /** P1, P2, S1, S2, E1... */
  id: string;
  tier: "primary" | "secondary" | "exploratory";
  /** Phrased as a question. */
  question: string;
};

export type Variable = {
  /** var_age, var_bmi. Referenced by the form and the tables. */
  id: string;
  /** The single authoritative wording. Nothing else stores a copy. */
  label: string;
  data_type: DataType;
  unit_coding: string;
  role: Role;
  /** Why a mediator or collider is excluded, printed under the map. */
  exclusion_reason?: string;
};

/**
 * The five questions an outcome must answer, held as five fields rather than one
 * sentence. A sentence can silently omit one; five fields cannot.
 */
export type Outcome = {
  /** out_conversion. Referenced by analyses and by table rows. */
  id: string;
  /** What exactly will be measured. Also the outcome's authoritative label. */
  what: string;
  /** How it will be measured. */
  how: string;
  /** Using which instrument. */
  instrument: string;
  /** At what time. */
  when: string;
  /** In which units. */
  units: string;
  domain: Domain;
  /** The variables that measure it, by id. */
  source_variable_ids: string[];
};

export type AnalysisRow = {
  objective_id: string;
  /** "P1 - conversion rate" */
  label: string;
  /** The outcome this analyses, by id. */
  outcome_id: string;
  /** The predictors, by id. Empty for a single-group estimate. */
  predictor_ids: string[];
  data_type: DataType;
  comparison: Comparison;
  paired: boolean;
  /** True when the data are known to be skewed, which forces a rank test. */
  skewed?: boolean;
  /** T1, T2... the id of the table this fills. */
  table_id: string;
  /** The model may depart from the rule table, but must say why in public. */
  test_override?: string;
  override_reason?: string;
  /** Filled by chooseTest(); never by the model. */
  test?: string;
};

/**
 * Section 0. What the study is, in one box.
 *
 * If a reader sees only this, they should be able to say what the study is.
 */
export type Glance = {
  population: string;
  what_is_measured: string;
  primary_outcome: string;
  main_comparison: string;
  /** The target n AND the basis for it, not just the number. */
  sample_size_basis: string;
};

/** The clinical question decomposed. Everything below must trace back to it. */
export type Picot = {
  framework: "PICOT" | "PECOT";
  population: string;
  /** Intervention for a trial, exposure for an observational study. */
  intervention_or_exposure: string;
  comparator: string;
  outcome: string;
  time: string;
  /** The whole question as one sentence. */
  assembled_question: string;
};

/**
 * The primary estimand, ICH E9(R1). Five attributes, because the estimand and
 * not the test is what the study is trying to estimate.
 */
export type Estimand = {
  treatment_condition: string;
  population: string;
  endpoint: string;
  /** treatment-policy / hypothetical / composite / while-on-treatment / principal-stratum. */
  intercurrent_strategy: string;
  /** The effect measure with its interval: difference in means, OR, HR. */
  summary_measure: string;
};

/** Section 4, fixed before the data are seen so they are never re-decided. */
export type StatisticalRules = {
  software: string;
  normality: string;
  continuous_summary: string;
  categorical_summary: string;
  significance: string;
  effect_estimates: string;
  missing_data: string;
  multiplicity: string;
  /** A fixed seed for anything stochastic, so the analysis reproduces. */
  reproducibility: string;
};

/** Who is analysed. Named once, referred to by each analysis. */
export type AnalysisPopulation = { name: string; definition: string };

export type IntercurrentEvent = { event: string; strategy: string };

export type Subgroup = { subgroup: string; how_tested: string };

/** One numbered step of the ladder every design follows. */
export type AnalysisStep = { step: string; what: string };

/**
 * Section 5A. The assumptions belong to the test that was chosen, so these are
 * written after the tests are, and only for the tests actually planned.
 */
export type AssumptionCheck = {
  /** The test these belong to, as the analysis map names it. */
  test: string;
  assumption: string;
  how_checked: string;
  if_violated: string;
  /** A short example in this study's own clinical terms. */
  example: string;
};

/** Section 7. A decision still open, to settle with the guide. */
export type OpenFlag = { flag: string; why: string };

export type SapSpec = {
  title: string;
  design: string;
  /** Department and institution, as one line. */
  setting: string;
  guideline: string;

  glance: Glance;
  picot: Picot;

  aim: string;
  /** The expected direction, where the study has one. */
  hypothesis: string;
  estimand: Estimand;
  objectives: Objective[];
  variables: Variable[];
  outcomes: Outcome[];
  analyses: AnalysisRow[];
  /** Expected events, for the degrees-of-freedom note. */
  expected_events?: number;
  sample_size?: number;
  /**
   * The MCID the study is powered to detect, its source, the assumed
   * variability or event rate, alpha, power and the dropout allowance. A target
   * n on its own is not a sample-size calculation.
   */
  sample_size_note: string;

  /** The confounders adjustment will use, respecting ten events per variable. */
  priority_confounder_ids: string[];

  rules: StatisticalRules;
  populations: AnalysisPopulation[];
  baseline_comparison: string;
  intercurrent_events: IntercurrentEvent[];
  testing_hierarchy: string;
  subgroups: Subgroup[];
  interim: string;
  steps: AnalysisStep[];
  assumption_checks: AssumptionCheck[];
  flags: OpenFlag[];
};

/* ---- the registry lookups every document uses --------------------- */

export function variableIndex(spec: SapRegistry): Map<string, Variable> {
  return new Map((spec.variables ?? []).map((v) => [v.id, v]));
}

export function outcomeIndex(spec: SapRegistry): Map<string, Outcome> {
  return new Map((spec.outcomes ?? []).map((o) => [o.id, o]));
}

/** The authoritative label for a variable, or the id when it does not resolve. */
export function labelOf(spec: SapRegistry, variableId: string): string {
  return variableIndex(spec).get(variableId)?.label ?? variableId;
}

/**
 * True when a stored plan carries the ids the case report form and the shell
 * tables link to. A plan built before the three documents were linked has
 * variables with a name and no id; building a form from it would produce a
 * document that only looks linked. Such a plan is rebuilt, not patched.
 */
export function isLinkable(spec: SapSpec | null | undefined): boolean {
  if (!spec) return false;
  const variables = spec.variables ?? [];
  const outcomes = spec.outcomes ?? [];
  if (!variables.length) return false;
  return variables.every((v) => Boolean(v?.id)) && outcomes.every((o) => Boolean(o?.id));
}

/**
 * Folds the five answers into one readable cell.
 *
 * Held as five fields so none can be quietly omitted, and joined here so the
 * table reads as a sentence rather than a form.
 */
export function outcomeCell(outcome: Outcome): string {
  const parts = [outcome.what];
  if (outcome.when) parts.push(`at ${outcome.when}`);
  if (outcome.instrument) parts.push(`from ${outcome.instrument}`);
  return parts.join(", ");
}

/**
 * The full definition, for the note under the map.
 *
 * All five answers are held so that none can be quietly omitted, but printing
 * all five in a table cell gives a paragraph per row and a map nobody reads.
 * The cell carries the name and where it comes from; this carries the rest.
 */
export function outcomeDefinition(outcome: Outcome): string {
  // The five answers are written as fragments, so they are joined into
  // sentences rather than pushed together with full stops between them: "the
  // surgeon's decision. at the index operation." is not a definition anyone
  // wants to read in a document they are about to sign.
  const capitalise = (v: string) => v.charAt(0).toUpperCase() + v.slice(1);

  const sentences: string[] = [];
  if (outcome.how) sentences.push(capitalise(outcome.how.trim().replace(/\.$/, "")));

  const where = [
    outcome.instrument ? `recorded from ${outcome.instrument.trim().replace(/\.$/, "")}` : "",
    outcome.when ? `at ${outcome.when.trim().replace(/\.$/, "")}` : "",
  ]
    .filter(Boolean)
    .join(", ");
  if (where) sentences.push(capitalise(where));

  if (outcome.units) {
    sentences.push(`Reported in ${outcome.units.trim().replace(/\.$/, "")}`);
  }

  return sentences.length ? `${sentences.join(". ")}.` : "";
}

/**
 * The part of the plan the other two documents actually read.
 *
 * A case report form and a set of shell tables need the registries and the
 * analysis rows; they have no use for the estimand or the interim-analysis
 * policy. Saying so keeps them from depending on the whole document.
 */
export type SapRegistry = Pick<
  SapSpec,
  "title" | "objectives" | "variables" | "outcomes" | "analyses"
> &
  Partial<Pick<SapSpec, "sample_size" | "expected_events">>;
