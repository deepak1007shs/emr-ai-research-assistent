import type {
  Block,
  ChainKind,
  CrfPattern,
  DataType,
  DesignFamily,
  FieldType,
  Frame,
  ObjectiveFamily,
  ObjectiveKind,
  ObjectiveSource,
  Role,
} from "./vocabulary.ts";

/**
 * The whole study, as one set of linked objects.
 *
 * The written process says it plainly: hold the process as a small set of
 * linked objects, render both documents from them, and never let either
 * document be edited directly. Everything below is that set.
 *
 * They live in one file because they reference each other and eight type files
 * importing each other in a ring is harder to read than one model. Behaviour
 * stays in its own module per object: `facts/`, `objectives/`, `variables/`,
 * `analysis/`, `rules/`, `tables/`, `crf/`, `checks/`.
 *
 * Two links matter more than the rest and are stored rather than recomputed:
 * a variable to the tables that report it, and a variable to the fields that
 * capture it. The backward check reads the first and check 7 reads the second,
 * and a link that is recomputed at check time can be recomputed differently.
 */

/** A visit code from the Facts Sheet: "D0", "W2", "W6". */
export type Timepoint = string;

/** An objective id: P1, P1a, S2, E1. Fixed at Step 1 and never changed. */
export type ObjectiveId = string;

/** A variable's short name, used as its id everywhere: "hb", "ga_enrol". */
export type VariableName = string;

/* ---- Stage 0 ------------------------------------------------------- */

export type IntakeFile = { name: string; type: string; pages: number | null };

/**
 * What arrived, and where each part of the protocol sits.
 *
 * Every later step quotes the protocol, and a quote that cannot be traced to a
 * page is a quote nobody can check.
 */
export type Study = {
  study_code: string;
  files: IntakeFile[];
  /** Key section to where it starts. Missing sections are absent, not empty. */
  sections: Record<string, { page: number | null; text: string }>;
  missing_sections: string[];
  /** The same thing written twice and differently, both versions kept. */
  conflicts: { item: string; versions: string[] }[];
  /** Follow the client's template where they sent one. */
  crf_pattern: CrfPattern;
  /** Variable names from a dataset the client already has, if any. */
  dataset_variable_names: string[] | null;
};

/* ---- Stage 1: the locked facts ------------------------------------- */

export type Group = { code: string; label: string };

export type Allocation = {
  ratio: string;
  block: number | null;
  strata: string[];
  /**
   * How participants were matched, where they were: "1 case to 2 controls,
   * matched on age and sex". Null where they were not.
   *
   * It changes the analysis rather than describing it. Matched sets have to be
   * kept together, and ignoring the matching makes the real effect look smaller
   * than it is, which is the direction nobody notices.
   */
  matched: string | null;
};

/**
 * One outcome, walked down the outcome chain.
 *
 * What is measured, how, with which instrument, at what time, in what unit,
 * and of what type. Gate A refuses a primary outcome with any link empty,
 * because every table below it would rest on the gap.
 */
export type OutcomeChain = {
  what: string;
  how: string;
  instrument: string;
  /**
   * Every visit this outcome is measured at.
   *
   * Not the two endpoints of a change. The process's own worked example writes
   * the primary as "haemoglobin change, day 0 to week 6" and records its time
   * as those two visits, which loses the fact that haemoglobin is read four
   * times - and that fact is the whole reason the study also owes a rate-of-
   * rise analysis. The change is a view of the measurements; the measurements
   * are what happened.
   */
  time: Timepoint[];
  unit: string;
  type: DataType;
  /**
   * The dictionary entries this outcome is built from.
   *
   * One for a raw outcome, one for a change or a threshold, two or more for a
   * ratio or an index. Step 2 reads this to decide whether the outcome is a
   * variable in its own right or a recipe over others, and without it the
   * decision would have to be made by reading "Haemoglobin at week 6 minus
   * haemoglobin at day 0" as English.
   */
  measures: VariableName[];
  /**
   * What the values are expected to look like.
   *
   * Not a result. A statistician knows before the study starts that serum
   * ferritin is right-skewed and that haemoglobin is not, and the two get
   * different tables: a median with the interquartile range and a
   * Hodges-Lehmann difference against a mean with a t-test. "unknown" is
   * honest and produces a TODO rather than a choice.
   */
  distribution: "normal" | "skewed" | "unknown";
  /**
   * For a binary outcome, the proportion expected to have it.
   *
   * Decision table C is keyed on this. Null is a question for the
   * investigator, never a guess: at 10% and above the plan is a risk ratio
   * from a log-binomial model, below it an odds ratio from a logistic one, and
   * the two answer differently.
   */
  expected_frequency: number | null;
  /**
   * For a time-to-event outcome, the event that can happen first and stop it.
   *
   * Death before relapse is the usual one. It changes the analysis completely:
   * one minus the Kaplan-Meier estimate overstates the risk when a competing
   * event exists, and the plan owes cumulative incidence functions and either a
   * cause-specific or a subdistribution model instead. Null where nothing else
   * can intervene, or where the event is death itself.
   */
  competing_event: string | null;
  /**
   * What this outcome is asked about: a comparison, an association, an
   * accuracy or an estimation.
   *
   * The field the build was missing. Every step used to read the question off
   * `facts.groups`, so a study with no arms was a study that compared nothing,
   * and an analytical cohort came out as a prevalence survey. See `ChainKind`.
   */
  kind: ChainKind;
  /**
   * The factors this objective estimates, for an association or an accuracy.
   *
   * Not the confounders. A confounder is held constant and lives in
   * `covariates`; an exposure is the thing whose association is being reported,
   * and the difference is the difference between the analysis a protocol asks
   * for and the one it gets. Empty for a comparison, where the groups are the
   * exposure, and for an estimation, which compares nothing.
   *
   * Per outcome rather than per study, because one protocol asks an
   * association of its primary and an accuracy of its first secondary.
   */
  exposures: Exposure[];
};

/** One factor an objective is about, with the level the others are read against. */
export type Exposure = {
  measure: VariableName;
  /** The visit the value is taken at, where it is recorded at several. */
  at: Timepoint | null;
  /** The category the others are compared with. Null for a measured value. */
  reference: string | null;
};

/**
 * One thing the study records, and everything needed to draw a field for it.
 *
 * The dictionary the whole build reads. Before it existed the visit schedule
 * held prose - "mean corpuscular volume" - and nothing said what kind of value
 * that is, which unit it comes in or what its categories are, so no step after
 * the model could draw a row for it or a field to collect it.
 *
 * This is the same move that made `options` a list rather than a sentence, and
 * it is made for the same reason: the model states the facts once, and code
 * uses them everywhere without asking again.
 */
export type Measure = {
  name: VariableName;
  label: string;
  type: DataType;
  /** For a numeric measure. Null for a categorical one. */
  unit: string | null;
  /** For a categorical measure, in print order. Null for a numeric one. */
  options: string[] | null;
  /**
   * Which descriptive table this measure is reported in, as the words that
   * finish its title: "demographic and obstetric characteristics",
   * "haematological and iron profile".
   *
   * Null for a measure that is not a baseline characteristic: an outcome, an
   * administrative field, or a variable that exists to define an analysis set.
   * One table per block and never two blocks merged (rule 6.3.2), which is why
   * the block is a fact about the measure rather than a judgement at print
   * time.
   */
  block: string | null;
  /**
   * The measures this one is computed from, where it is computed at all.
   *
   * Body mass index is the case: height and weight are written on the form,
   * the index is not, and Table 1 carries a row for it. Without this the
   * choice is to invent the variable or to lose the row, and this build does
   * neither.
   */
  derived_from: VariableName[];
  /** The calculation in plain words. Null for a measure that is recorded. */
  recipe: string | null;
};

/**
 * An idea the protocol raised without making it an objective.
 *
 * The question is kept in the protocol's own words. What it is *about* is
 * named, because no rule turns "whether the effect differs by dietary pattern"
 * into a variable, and a step that guessed would be the sixth model call this
 * rebuild exists to remove.
 */
export type ExploratoryIdea = {
  question: string;
  kind: "subgroup" | "interaction" | "derivation" | "correlation";
  /** The outcome the question is asked of, by its variable name. */
  outcome_of: VariableName;
  /** The other variables the question involves. */
  with: VariableName[];
};

/** A covariate an adjusted model holds constant, named by its measure. */
export type NamedCovariate = {
  measure: VariableName;
  /** The visit the value is taken at, where the measure is taken at several. */
  at: Timepoint | null;
  inferred: boolean;
};

/** One proforma item, kept or dropped, with the reason (Stage 1.14). */
export type ProformaItem = {
  item: string;
  /** The dictionary entry this item records, or null where it is dropped. */
  measure: VariableName | null;
  keep: boolean;
  reason: string;
  /**
   * What a kept item is for, from a closed list.
   *
   * The triage is a Stage 1 judgement the investigator signs off, so the word
   * is a value here rather than a decision taken later from the reason prose.
   */
  purpose: "administrative" | "descriptor" | "population" | "input" | null;
};

/**
 * The Locked Protocol Facts Sheet.
 *
 * Written at the end of Stage 1 and frozen. The SAP skill's Step 2 reads "the
 * Facts Sheet from Step 0" and the skill has no Step 0 (gap G1); this is where
 * it is written, and this is the last thing a model decides. Every step after
 * it is rules over these fields, which is what makes two runs of one protocol
 * produce one document.
 */
export type FactsSheet = {
  /**
   * The protocol's title, word for word.
   *
   * Kept because a title makes promises. "The rise in haemoglobin" promises a
   * rate, and a plan that answers only "how much by week six" has not answered
   * the study's own title. Check S1-3 reads it.
   */
  title: string;
  /** The aim, in the protocol's own words. */
  aim: string;
  /** The hypothesis, or null. Null prints as "Not stated in the protocol". */
  hypothesis: string | null;
  design: DesignFamily;
  /**
   * Who the study is about, what it does to them and against what.
   *
   * These are the P, the I or E, and the C of the frame. They are prose taken
   * from the protocol rather than derived, because eligibility is written in
   * sentences and no rule turns an inclusion list into one.
   */
  population: {
    eligibility: string;
    setting: string;
    sampling: string;
    /**
     * The population in one short phrase: "pregnant women with
     * iron-deficiency anaemia".
     *
     * The eligibility criteria are a paragraph, and the assembled question
     * needs a noun phrase. Taking the first sentence of the paragraph gives
     * "Pregnant women at 20 to 28 weeks' gestation with iron-deficiency
     * anaemia (haemoglobin 7" as often as not, because the criteria are full
     * of decimal points.
     */
    short: string;
  };
  intervention: string;
  comparator: string;
  /** The exact label, as prose: "two-arm parallel-group open-label superiority RCT". */
  design_label: string;
  /**
   * What the objective is actually asking for.
   *
   * The same model can be right or wrong depending on this. An effect or
   * association question takes its variables from clinical knowledge, enters
   * them together and is judged by the estimate; a prediction question may let
   * the data choose the variables and is judged by discrimination, calibration
   * and validation. A variable that helps prediction can wreck a causal
   * estimate, which is why this is settled before any model is named.
   */
  question_type: "effect" | "association" | "prediction";
  /**
   * What one row of the data is, and how many rows a participant gives.
   *
   * Usually one row per person. Where it is an eye, a lesion, a tooth or a
   * reading, two rows from one participant are alike, and analysing them as two
   * participants gives standard errors that are too small and p values that are
   * too easily believed.
   */
  unit_of_analysis: {
    /** "participant", "eye", "lesion", "tooth", "reading". */
    unit: string;
    /** True where one participant contributes more than one row. */
    repeats_within_participant: boolean;
  };
  /**
   * True where everyone's exposure is settled at the moment follow-up starts.
   *
   * False for an exposure defined by something that happens during follow-up:
   * "patients who received drug X during admission". Those patients had to
   * survive long enough to receive it, so the untreated group carries the early
   * deaths and the treatment looks protective when it does nothing. That is
   * immortal-time bias, and the repair is to let the exposure change over time
   * in the model rather than to fix it at baseline.
   */
  exposure_fixed_at_baseline: boolean;
  guideline: string;
  frame: Frame;
  groups: Group[];
  allocation: Allocation;
  timepoints: Timepoint[];
  /**
   * What is measured at each visit.
   *
   * The Facts Sheet field list names it and nothing else carries it. Step 1
   * needs it: an outcome measured at more than its two endpoints gets a shape
   * question as well as a level one, and the only way to know that Hb is read
   * at four visits when the primary outcome is "change from day 0 to week 6"
   * is to look at the schedule.
   */
  visit_schedule: {
    timepoint: Timepoint;
    /** How the visit is written in a table: "Day 0", "Week 6". */
    label: string;
    measures: VariableName[];
  }[];
  /**
   * Every measure the study records, by name.
   *
   * The visit schedule and the proforma refer to these names and nothing else.
   * Gate A refuses a schedule that names a measure the dictionary does not
   * carry, because the field for it would silently not be drawn.
   */
  measures: Measure[];
  primary: OutcomeChain;
  secondary: OutcomeChain[];
  /** Anything in the aims or hypothesis that is not a formal objective. */
  exploratory_ideas: ExploratoryIdea[];
  covariates: NamedCovariate[];
  proforma: ProformaItem[];
  sample_size: {
    per_group: number | null;
    formula_family: string;
    verdict: "correct" | "wrong_formula" | "absent" | "partial";
    attrition: string | null;
  };
  /**
   * The analysis rules the protocol actually states.
   *
   * Null means the protocol is silent, and Step 5 writes the house default and
   * a TODO beside it. Kept apart from the defaults so that a reader can tell
   * what the investigator decided from what the plan supplied, which is the
   * difference between a rule and an assumption.
   */
  stated_rules: {
    software: string | null;
    alpha: string | null;
    sided: "one" | "two" | null;
    ci_level: string | null;
    missing_data: string | null;
    interim: string | null;
  };
  /** Every question still waiting for the investigator. Each becomes a TODO. */
  open_items: string[];
};

/* ---- Step 1 -------------------------------------------------------- */

export type Objective = {
  id: ObjectiveId;
  family: ObjectiveFamily;
  kind: ObjectiveKind;
  /** The question, naming one outcome and one comparison. */
  question: string;
  outcome: VariableName;
  comparison: string;
  source: ObjectiveSource;
  todo: string[];
};

/** P, I/E, C, O, T, each with the study's answer. */
export type PicotRow = { letter: string; element: string; value: string };

export type Picot = {
  frame: Frame;
  rows: PicotRow[];
  assembled_question: string;
  aim: string;
  /** "Not stated in the protocol" where there is none. Never invented. */
  hypothesis: string;
};

/* ---- Steps 2 and 3 ------------------------------------------------- */

/**
 * One variable of the master variable list.
 *
 * `roles` is keyed by objective id, and by `adjust:<id>` where the variable
 * enters that objective's adjusted model, because one variable holds different
 * roles for different questions.
 *
 * `options` is a list and not prose. The old model held it as a sentence, and
 * code could not turn "Kuppuswamy education score, 1 (illiterate) to 7
 * (profession/honours)" into rows: it gave two rows of nonsense for years. A
 * list can be drawn as one row per category, which is what lets the table
 * builder run without asking a model.
 */
export type Variable = {
  name: VariableName;
  label: string;
  roles: Record<string, Role>;
  type: DataType;
  /** For a numeric variable. Every numeric variable has one (check S2-4). */
  unit: string | null;
  /** For a categorical variable, in print order. Yes before No, Male before Female. */
  options: string[] | null;
  timepoints: Timepoint[];
  /** The raw variables this is calculated from. Empty for a raw variable. */
  derived_from: VariableName[];
  /** The recipe in plain words: "Hb at week 6 minus Hb at day 0". */
  recipe: string | null;
  /** False for every derived variable: a derived value is never a CRF field. */
  crf: boolean;
  source: "protocol" | "inferred" | "promoted";
};

/** An exploratory question and the rows it reuses (Step 3). */
export type ExploratoryOutcome = {
  id: ObjectiveId;
  question: string;
  kind: "subgroup" | "interaction" | "derivation" | "correlation";
  reuses: VariableName[];
  /** Where a variable had to be added, the reason the investigator can check. */
  promoted: { variable: VariableName; reason: string } | null;
};

/* ---- Step 4 -------------------------------------------------------- */

export type Covariate = {
  var: VariableName;
  /** The timepoint the covariate is taken at, where it matters. */
  at: Timepoint | null;
  /** One line saying why this covariate and not another. */
  reason: string;
};

export type Unadjusted = {
  test: string;
  /** The named test used when the assumption fails. */
  fallback: string | null;
  table: string;
};

export type Adjusted = {
  model: string;
  /** The named model used when the first fails to converge. */
  fallback: string | null;
  covariates: Covariate[];
  table: string;
  /** Every model owes a fit table (rule R10). */
  fit_table: string;
};

/**
 * One row of the Analysis Map: the hinge between an objective and its tables.
 *
 * `exception` records the two places where "unadjusted then adjusted" does not
 * apply: an estimation objective, which gets a summary with an interval and no
 * p value, and a safety outcome, which is reported and not modelled. A third,
 * `too_few_events`, records a model that must not be fitted at all. A fourth,
 * `diagnostic`, records a question a diagnostic accuracy study asks: how well
 * a test finds a condition, or how it tracks a grade, is estimated and not
 * adjusted, because there is no exposure effect to hold anything constant for.
 */
export type AnalysisRow = {
  objective: ObjectiveId;
  outcome: VariableName;
  predictors: VariableName[];
  data_type: DataType;
  /** Per person, per eye, per lesion, per reading. */
  unit_of_analysis: string;
  /** "1 value per woman", "4 readings per woman". */
  count: string;
  /** For a binary outcome: the expected rate. Null is a TODO, never a guess. */
  expected_frequency: number | null;
  effect_measure: string;
  /** The absolute measure printed beside every ratio. */
  absolute: string | null;
  unadjusted: Unadjusted | null;
  adjusted: Adjusted | null;
  exception: "estimation" | "safety" | "too_few_events" | "diagnostic" | null;
};

/* ---- Step 5 -------------------------------------------------------- */

export type Population = { name: string; definition: string };

export type Rules = {
  populations: Population[];
  /** The line that opens the primary block, with the flow through the study. */
  population_line: string;
  software: string;
  alpha: string;
  sided: "one" | "two";
  ci_level: string;
  summaries: string;
  normality: string;
  missing_data: string;
  /** One line per family present, printed under that family's heading. */
  multiplicity: Partial<Record<ObjectiveFamily | "safety", string>>;
  /** The rule, or "No interim analysis planned". Never absent. */
  interim: string;
  /** The alternative assumptions that become the sensitivity table's rows. */
  sensitivity_rows: string[];
};

/* ---- Step 6 -------------------------------------------------------- */

export type TableRow = {
  label: string;
  /** The variable this row reports, where it reports one. */
  variable: VariableName | null;
  /** A category of the row above it, drawn on its own line. */
  indent: boolean;
};

/**
 * One shell table: a title, a grid with nothing in it, and one footnote.
 *
 * `fit_table_of` marks a fit table, which takes its model's number and a
 * letter. `variables` is the stored link the backward check reads.
 */
export type ShellTable = {
  number: string;
  block: Block;
  /**
   * Which template row drew this table: `summary`, `unadjusted`, `adjusted`,
   * `rate_of_change`, `overlap`, `fit`, `ratio`, `safety`, `sensitivity`,
   * `descriptive`, `subgroup`, `correlation`.
   *
   * Stored rather than read back out of the title. The table that reports the
   * unadjusted comparison is titled "Unadjusted comparison of ...", which
   * contains the word "adjusted", and a check that matched on the title pointed
   * the adjusted model at the unadjusted table.
   */
  kind: string;
  title: string;
  columns: string[];
  rows: TableRow[];
  footnote: string;
  /** The number of the table this one reports the fit of, or null. */
  fit_table_of: string | null;
  /** Every objective this table reports. */
  fills: ObjectiveId[];
  variables: VariableName[];
};

/* ---- Step 8 -------------------------------------------------------- */

export type CrfSection = {
  /** "A", "G1": a letter, and a number where a section repeats per visit. */
  code: string;
  title: string;
};

export type CrfField = {
  section: string;
  /** Restarts at 1 in every section. */
  sno: number;
  label: string;
  type: FieldType;
  unit: string | null;
  options: string[] | null;
  /** The variable captured, or "infrastructure" for a field that analyses nothing. */
  source_variable: VariableName | "infrastructure";
  timepoint: Timepoint | null;
  /** When the field applies: "arm == ORAL" for tablets returned. */
  condition: string | null;
};

/**
 * Why a field is on the form.
 *
 * Kept per field and printed nowhere. Gate C is four set operations over these
 * - not less, not extra, covariates, nothing derived - and a check that has to
 * work out for itself why a field exists is a check that reads the form's words.
 * The deleted builder did that, and its own comment says what it cost: a form
 * whose fields were matched to variables by their wording, until ids replaced
 * the matching.
 *
 * `via` is the derived value a raw field feeds: height and weight are on the
 * form because Table 1 reports body mass index, and neither of them appears in
 * Table 1 by name.
 */
export type CrfTrace =
  /** A row label, a column group or a model term of that table. */
  | { table: string; via?: VariableName }
  /** Held constant by that table's model, or splitting it into sub-groups. */
  | { table: string; as: "covariate" | "stratifier"; at: Timepoint | null }
  /** Capture infrastructure: rule 5's five kinds, which analyse nothing. */
  | { infrastructure: true };

/** A capture rule stated between two tables, where one needs stating (C10). */
export type CrfNote = { section: string; text: string };

/* ---- Step 7 and check 7 -------------------------------------------- */

export type CheckResult = {
  id: string;
  pass: boolean;
  /** The objects that failed, by their own ids, so a fix knows where to go. */
  failing: string[];
  message: string;
};
