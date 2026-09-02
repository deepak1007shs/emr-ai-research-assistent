import type { AnalysisRow, Objective, SapRegistry } from "../sap/types.ts";
import { chooseTest, degreesOfFreedomNote } from "../sap/choose-test.ts";
import { outcomeIndex, variableIndex } from "../sap/types.ts";
import type { ShellTable, TableModel, TableRole, TableRow } from "./types.ts";
import { designRule } from "./design-tables.ts";

/**
 * The analytic tables, laid out from the plan rather than asked for.
 *
 * One outcome is one table: the groups across the top, the outcome down the
 * side, and the estimates and the p value beside the counts they were computed
 * from. Beside it sit the tables whose rows are something else entirely - the
 * adjusted model, whose rows are the confounders; the subgroup table, whose
 * rows are the subgroups; the sensitivity table, whose rows are the analysis
 * populations. Every one of those shapes is a consequence of the analysis row
 * and not a judgement a model should be making. It used to be, and the result
 * was a single one-row table naming an odds ratio for a common outcome, which
 * is the one estimate the rule table says to avoid.
 *
 * What is left to the model is what genuinely needs judgement: which baseline
 * variables belong in the descriptive table, which time points a repeated
 * measure was taken at, which categories a distribution has.
 */

/** The roles this file owns. Everything else is the model's to lay out. */
const ANALYTIC = new Set(["outcome", "predictors", "effect_adjusted", "subgroup", "sensitivity"]);

export function isAnalyticRole(role: string): boolean {
  return ANALYTIC.has(role);
}

/**
 * The analytic roles this version can actually draw.
 *
 * The design catalogue names every table a design owes, including the ones no
 * builder exists for yet. Keeping the two lists apart is what lets the guard
 * say "this design needs an ROC table and nothing here can draw one" instead of
 * quietly producing a document that is missing it.
 */
export const BUILDABLE: ReadonlySet<TableRole> = ANALYTIC as ReadonlySet<TableRole>;

/**
 * The roles the model lays out, because they need judgement code has not got.
 *
 * `distribution` left this list when the outcome table absorbed it. The model
 * still says what a categorical outcome's categories are - that is a fact only
 * a reader of the protocol has - but it no longer builds a table out of them.
 */
const MODEL_AUTHORED: ReadonlySet<TableRole> = new Set<TableRole>([
  "descriptive",
  "repeated",
]);

/** The roles a design requires that nothing in this version can produce. */
export function unbuildableRoles(sap: SapRegistry): TableRole[] {
  return designRule(sap.design_family).roles.filter(
    (role) => !isAnalyticRole(role) && !MODEL_AUTHORED.has(role),
  );
}

/**
 * The plan for a row, preferring what was stored on it.
 *
 * A plan built before the analysis rows carried their own test has none, and
 * rebuilding every stored plan to lay out its tables would be absurd, so the
 * rule table is consulted again for those. Anything built since reads its own
 * decision back, which is the point: the table and the plan cannot disagree
 * about the estimate if only one of them ever chose it.
 */
export function planOf(row: AnalysisRow) {
  if (row.measures?.length || row.test) {
    return {
      test: row.test,
      test_adjusted: row.test_adjusted,
      avoid: row.avoid,
      measures: row.measures ?? [],
    };
  }
  const plan = chooseTest(row);
  return {
    test: plan?.unadjusted ?? undefined,
    test_adjusted: plan?.adjusted ?? undefined,
    avoid: plan?.avoid ?? undefined,
    measures: plan?.measures ?? [],
  };
}

const capitalise = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/**
 * Lowercases a variable's label so it can sit mid-sentence, unless it opens
 * with an acronym. "Previous abdominal surgery" becomes lower case; "PEEP
 * group" and "BMI category" are left alone, because "pEEP group" is worse than
 * either.
 *
 * Only variables go through this. An outcome keeps the wording the registry
 * gave it, because an outcome is often a named thing: "Apgar score" lowercased
 * is wrong in a way that "Delivery room intubation" capitalised is not.
 */
function midSentence(label: string): string {
  const first = label.split(/\s+/)[0] ?? "";
  if (first.length > 1 && first === first.toUpperCase()) return label;
  return label ? label[0].toLowerCase() + label.slice(1) : label;
}

/** "P1 - delivery room intubation" reads as a subject once the id is dropped. */
const stripId = (label: string) => label.replace(/^[A-Z]+\d+\s*[-:]\s*/, "").trim();

/** The designs whose allocation is random, and whose flow table says so. */
const RANDOMISED = new Set([
  "randomised_trial",
  "non_inferiority_trial",
  "crossover_trial",
  "cluster_trial",
  "factorial_trial",
]);

const TIER_RANK = { primary: 0, secondary: 1, exploratory: 2 } as const;
type Tier = keyof typeof TIER_RANK;

const BLOCK_OF: Record<Tier, ShellTable["block"]> = {
  primary: "primary",
  secondary: "secondary",
  exploratory: "exploratory",
};

/** The highest tier any of the row's objectives sits at. */
function tierOf(row: AnalysisRow, objectives: Map<string, Objective>): Tier {
  let best: Tier = "exploratory";
  for (const id of row.objective_ids ?? []) {
    const tier = objectives.get(id)?.tier;
    if (tier && TIER_RANK[tier] < TIER_RANK[best]) best = tier;
  }
  return best;
}

/**
 * How a group is summarised, by what kind of thing the outcome is.
 *
 * The reference plans all agree on this and it is not a choice: a proportion
 * carries its numerator over its denominator, a skewed measure carries a median
 * and an interquartile range, and a rate carries its person-time.
 */
function summaryColumns(row: AnalysisRow): string[] {
  switch (row.data_type) {
    case "binary":
      return ["n / N", "% (95% CI)"];
    case "count":
      return ["Events", "Person-time", "Rate per unit time (95% CI)"];
    case "time_to_event":
      return ["Events / N", "Median survival (95% CI)"];
    case "ordinal":
      return ["n", "Median (IQR)"];
    case "nominal":
      return ["n (%)"];
    default:
      return row.skewed ? ["n", "Median (IQR)"] : ["n", "Mean ± SD"];
  }
}

/**
 * What is done for this shape of table when a value is not there.
 *
 * Fixed before the data are looked at, which is the whole reason the house
 * blueprint puts it under every table: handling decided afterwards is a
 * reaction to the results, and reads as one.
 */
const IF_MISSING: Partial<Record<TableRole, string>> = {
  outcome:
    "A patient in whom the outcome could not be assessed is not counted as not having had it. Such patients are excluded from the denominator, and the reduced denominator is written next to the variable name.",
  effect_adjusted:
    "The model is fitted on the population the plan names. Where the plan imputes, the complete case estimate is reported beside the imputed one so the two can be compared.",
  sensitivity:
    "This table is where missing data are tested rather than handled. The best case and worst case rows exist to show how far the conclusion could move if every patient lost to follow-up had, or had not, had the outcome.",
  subgroup:
    "A subgroup with fewer than five events is described without an estimate, and the cell is left blank rather than filled with an unstable one.",
  flow: "This table is the account of where everyone went, so nothing in it is missing by definition. A number that cannot be given is a number the study cannot claim.",
};

export type BlockContext = {
  sap: SapRegistry;
  groups: string[];
  /**
   * The categories of each categorical outcome, by outcome id.
   *
   * Supplied by the model, because nothing in the plan lists them reliably:
   * the outcome registry records them as prose, and "Binary (dead/alive),
   * reported as a percentage per group" split on its slash gave two rows of
   * nonsense for years.
   */
  categories: Map<string, string[]>;
  /**
   * The time points each repeated measure was recorded at, by outcome id.
   *
   * From the model for the same reason the categories are: the plan records
   * them as prose, and "every 5 minutes during each phase of each session"
   * cannot be read as a list of rows.
   */
  timepoints: Map<string, string[]>;
};

function subjectOf(row: AnalysisRow, sap: SapRegistry): string {
  const outcomes = outcomeIndex(sap);
  const ids = row.outcome_ids ?? [];
  if (ids.length === 1) {
    const outcome = outcomes.get(ids[0]);
    if (outcome?.what) return outcome.what;
  }
  return stripId(row.label ?? "");
}

function exposurePhrase(row: AnalysisRow, sap: SapRegistry): string {
  const variables = variableIndex(sap);
  const names = (row.exposure_ids ?? [])
    .map((id) => variables.get(id)?.label ?? id)
    .filter(Boolean)
    .map(midSentence);
  return names.length ? names.join(" and ") : "";
}

/** True where the analysis compares something with something else. */
export function hasContrast(row: AnalysisRow): boolean {
  return (
    (row.exposure_ids ?? []).length > 0 &&
    row.comparison !== "single_group" &&
    row.comparison !== "descriptive"
  );
}

/**
 * The levels the effect is compared across.
 *
 * Read from the exposure variable's own coding, not from the document's group
 * list. Those are not the same thing: in a trial the groups are the arms and
 * the two agree, but in an observational study the baseline table is often laid
 * out by outcome, and taking the column headings from there would report the
 * exposure's effect across the levels of the outcome.
 */
function contrastLevels(row: AnalysisRow, sap: SapRegistry, fallback: string[]): string[] {
  const variables = variableIndex(sap);
  const ids = row.exposure_ids ?? [];
  if (ids.length === 1) {
    const coding = variables.get(ids[0])?.unit_coding ?? "";
    const levels = coding
      .split("/")
      .map((level) => level.trim())
      .filter(Boolean);
    // Two or more named levels is a categorical exposure. One is a unit, as in
    // "kg/m2", and a continuous exposure has no levels to put in a column.
    if (levels.length > 1) return levels;
  }
  return fallback;
}

/** The denominator every title ends with, where the plan knows it. */
function denominator(sap: SapRegistry): string {
  return sap.sample_size ? ` (n = ${sap.sample_size})` : "";
}

/**
 * The estimate an adjusted column reports, taken from the plan's own list.
 *
 * The first measure is the one the study leads with, which is why the rule
 * table writes them in order.
 */
function headlineMeasure(row: AnalysisRow): string {
  return planOf(row).measures[0] ?? "Effect estimate";
}

function lower(measure: string): string {
  return measure ? measure[0].toLowerCase() + measure.slice(1) : measure;
}

/**
 * What the adjusted column holds constant.
 *
 * One model, not a ladder. A ladder of progressively adjusted columns is a
 * legitimate way to report an adjusted effect, but it is not the one a thesis
 * is read with: a supervisor wants the crude estimate and the adjusted estimate
 * on the same row, for each predictor, so the two can be compared by eye.
 */
function adjustmentSet(row: AnalysisRow): TableModel[] {
  const adjust = row.adjust_for_ids ?? [];
  if (!adjust.length) return [];
  return [{ name: "Adjusted", adds: adjust }];
}

/**
 * Where everyone went.
 *
 * The first table a trial or a before-and-after study owes, and the one a
 * reader checks before believing any of the others: how many were approached,
 * how many entered, and where the difference went. It belongs to the document
 * rather than to any one analysis, so it is built once.
 */
function flowTable(sap: SapRegistry, groups: string[], randomised: boolean): ShellTable {
  const stage = (label: string) => ({ label, kind: "category" as const, indent: true });
  const heading = (label: string) => ({ label, kind: "variable" as const, heading: true });

  const rows: TableRow[] = [
    heading("Enrolment"),
    stage("Assessed for eligibility"),
    stage("Excluded, did not meet the inclusion criteria"),
    stage("Excluded, met an exclusion criterion"),
    stage("Excluded, declined to participate"),
    heading(randomised ? "Allocation" : "Enrolled"),
    stage(randomised ? "Randomised" : "Enrolled and received the intervention"),
    stage(randomised ? "Received the allocated intervention" : "Completed the baseline measurement"),
    stage(randomised ? "Did not receive the allocated intervention" : "Withdrew before the intervention"),
    heading("Follow-up"),
    stage("Lost to follow-up"),
    stage("Discontinued the intervention"),
    heading("Analysis"),
    stage("Included in the primary analysis"),
    stage("Excluded from the primary analysis"),
  ];

  const columns = groups.length > 1 ? ["Stage", ...groups, "Total"] : ["Stage", "n"];

  return {
    number: 0,
    block: "descriptive",
    role: "flow",
    if_missing: IF_MISSING.flow,
    title: `Participant flow through the study${denominator(sap)}`,
    columns,
    rows,
    footnote:
      "Every participant assessed for eligibility is accounted for on one of these rows. A study that cannot say where a participant went cannot say its analysis population is what it claims.",
  };
}

/* ---- the outcome table, and the ones beside it ---------------------- */

/**
 * What each cell of a group column holds.
 *
 * A grid says this in its column headers. This document does not draw grids, so
 * a table that says its columns are the two arms has still not said whether
 * they carry a count, a percentage or a mean, and this is the sentence that
 * does.
 */
function reportedAs(row: AnalysisRow): string {
  // The rule table's own summary line where it has one, so the cell statistic
  // and the test come from one source rather than being guessed twice. It
  // states the rule ("mean +/- SD where the distribution allows it, median
  // (IQR) where it does not") rather than pre-judging, which is what a plan
  // written before the data arrive can honestly say.
  const summary = chooseTest(row)?.summary;
  if (summary) return summary;

  switch (row.data_type) {
    case "binary":
      return "n (%), with the denominator analysed";
    case "count":
      return "events over person-time, with the rate";
    case "time_to_event":
      return "events / N, with median survival";
    case "ordinal":
      return "median (IQR)";
    case "nominal":
      return "n (%)";
    default:
      return row.skewed ? "median (IQR)" : "mean +/- SD";
  }
}

/** True where the outcome can be laid out across group columns. */
function comparable(row: AnalysisRow): boolean {
  if (!hasContrast(row)) return false;
  // A correlation and an agreement have no groups to put across the top. A
  // repeated measure has: the groups go across and the time points come down,
  // which is the table a mixed model is read from. It used to be excluded here
  // and fell out as an estimate with no numbers beside it, which is the shape
  // this whole change exists to remove.
  return row.comparison !== "correlation" && row.comparison !== "agreement";
}

/**
 * A study hunting predictors, rather than comparing two arms.
 *
 * "Does acquisition group change mortality?" and "what predicts infection?" are
 * both comparisons and they are laid out the other way round from each other.
 * The first groups by the exposure, so the outcome is the row. The second groups
 * by the outcome, so every candidate predictor is a row - one table of
 * twenty-six rows, and not twenty-six tables, which is what this code produced
 * before it could tell the two apart.
 */
function isPredictorHunt(row: AnalysisRow): boolean {
  return row.comparison === "association" || (row.exposure_ids ?? []).length > 1;
}

/** The groups a predictor table compares across: the outcome's own levels. */
function outcomeLevels(row: AnalysisRow, ctx: BlockContext): string[] {
  const ids = row.outcome_ids ?? [];
  if (ids.length !== 1) return [];
  const named = ctx.categories.get(ids[0]) ?? [];
  if (named.length > 1) return named;
  // A binary outcome the model did not name the levels of. The outcome itself
  // is in the title, so the columns need only say which side of it they are.
  return row.data_type === "binary" ? ["Present", "Absent"] : [];
}

/**
 * Candidate predictors down the side, split by what kind of thing they are.
 *
 * Two tables and not one, because the cell and the test both differ: a
 * categorical predictor is counted and tested by chi-square, a numerical one is
 * summarised and tested by t-test or Mann-Whitney. Putting them in one table
 * would mean one column meaning two things and one footnote naming two tests.
 */
function predictorTables(row: AnalysisRow, tier: Tier, ctx: BlockContext): ShellTable[] {
  const { sap } = ctx;
  const variables = variableIndex(sap);
  const subject = subjectOf(row, sap);
  const levels = outcomeLevels(row, ctx);
  const plan = planOf(row);
  const crude = plan.measures[0] ?? "Effect estimate";

  const CATEGORICAL = new Set(["binary", "nominal", "ordinal"]);
  const split = {
    categorical: [] as string[],
    numerical: [] as string[],
  };
  for (const id of row.exposure_ids ?? []) {
    const type = variables.get(id)?.data_type;
    if (!type) continue;
    (CATEGORICAL.has(type) ? split.categorical : split.numerical).push(id);
  }

  const out: ShellTable[] = [];
  const shapes = [
    {
      job: "categorical",
      ids: split.categorical,
      // The rule table decides the test, from a row describing what this table
      // actually compares rather than what the whole analysis does.
      probe: { ...row, data_type: "binary" as const, comparison: "two_groups" as const },
      title: `Association between categorical variables and ${midSentence(subject)}${denominator(sap)}`,
      cell: "n (%) within each outcome group, the percentage taken out of that group's total",
    },
    {
      job: "numerical",
      ids: split.numerical,
      probe: { ...row, data_type: "continuous" as const, comparison: "two_groups" as const },
      title: `Comparison of numerical variables between patients with and without ${midSentence(subject)}${denominator(sap)}`,
      cell: row.skewed
        ? "median (IQR), the same statistic used for both groups within a row"
        : "mean +/- SD where the distribution allows it, median (IQR) where it does not, the same statistic used for both groups within a row",
    },
  ];

  for (const shape of shapes) {
    if (!shape.ids.length) continue;
    const chosen = chooseTest(shape.probe);
    out.push({
      number: 0,
      block: BLOCK_OF[tier],
      role: "predictors",
      // The predictors themselves as well as the split, for the same reason an
      // outcome table carries its exposure: one objective can hunt predictors
      // of one outcome in two different sets, and those are two tables.
      job: `${(row.exposure_ids ?? []).join("+")}:${shape.job}`,
      outcome_id: (row.outcome_ids ?? []).length === 1 ? row.outcome_ids[0] : undefined,
      fills: row.objective_ids?.length ? [...row.objective_ids] : undefined,
      title: capitalise(shape.title),
      columns: ["Variable", ...levels, `Crude ${lower(crude)} (95% CI)`, "P value"],
      rows: shape.ids.map((id) => ({
        variable_id: variables.has(id) ? id : undefined,
        label: variables.get(id)?.label ?? id,
        kind: "variable" as const,
      })),
      reported_as: shape.cell,
      test_applied: chosen?.unadjusted ?? plan.test,
      if_missing:
        "Complete case for this table, with the reduced n written next to each variable name. A variable exceeding twenty per cent missing is described in Section A only and is not carried into the adjusted model.",
      footnote: [
        "One crude estimate per row, from a model containing that variable alone. No variable is dropped here on the strength of its p value.",
        plan.avoid ? `Not to be reported here: ${lower(plan.avoid)}.` : "",
      ]
        .filter(Boolean)
        .join(" "),
    });
  }

  return out;
}

/**
 * One outcome, whole.
 *
 * This replaced three tables. A study used to report its primary outcome as a
 * whole-cohort count, then the same count split by group, then a third table of
 * estimates - so a reader had to hold three tables open to learn one thing, and
 * the estimates sat a page away from the counts they were computed from. The
 * whole-cohort count is now the Total column, the estimates are the right-hand
 * columns, and the outcome is the row.
 */
function outcomeTable(row: AnalysisRow, tier: Tier, ctx: BlockContext): ShellTable {
  // A descriptive analysis has nothing to compare and still has something to
  // report. It used to return null here, inherited from the days when a
  // separate distribution table covered it; nothing covered it afterwards, and
  // the objective simply went unreported.
  const { sap, groups, categories, timepoints } = ctx;
  const outcomes = outcomeIndex(sap);
  const ids = row.outcome_ids ?? [];
  const plan = planOf(row);
  const measures = plan.measures;
  const by = exposurePhrase(row, sap);
  const subject = subjectOf(row, sap);
  const withP = row.comparison !== "agreement";

  const estimates = measures.map((m) => `${m} (95% CI)`);
  const title = capitalise(`${subject}${by ? ` by ${by}` : ""}${denominator(sap)}`);

  const base = {
    number: 0,
    block: BLOCK_OF[tier],
    role: "outcome" as const,
    // What this table compares by, and what it treats the outcome as. Two
    // analyses of one outcome under one objective are a duplicate only when
    // both match: Naveen reports hyperthermia by growth restriction and again
    // by thermal care phase, and Mahendra reports one score as a median and
    // again as the proportion above its threshold. Three tables, no mistakes.
    job: `${(row.exposure_ids ?? []).join("+") || "overall"}:${row.data_type}`,
    if_missing: IF_MISSING.outcome,
    outcome_id: ids.length === 1 ? ids[0] : undefined,
    fills: row.objective_ids?.length ? [...row.objective_ids] : undefined,
    title,
    // A repeated measure has no unadjusted test: the mixed model is the
    // analysis, so that is what is named under it. Where neither the plan nor
    // the rule table has one, the gap is printed rather than left blank: a
    // missing line reads as a table nobody thought about.
    test_applied:
      plan.test ??
      plan.test_adjusted ??
      `TODO: the rule table has no entry for a ${row.data_type} outcome with comparison "${row.comparison}". Name the test here.`,
  };

  const footnote = (...parts: (string | undefined)[]) =>
    parts.filter(Boolean).join(" ") || undefined;
  const avoided = plan.avoid ? `Not to be reported here: ${lower(plan.avoid)}.` : undefined;

  // Several outcomes compared the same way share one table: the outcomes are
  // the rows, and every group and every estimate is a column.
  if (ids.length > 1 && comparable(row)) {
    return {
      ...base,
      columns: [
        "Outcome",
        ...contrastLevels(row, sap, groups),
        "Total",
        ...estimates,
        ...(withP ? ["P value"] : []),
      ],
      rows: ids.map((id) => ({
        label: outcomes.get(id)?.what ?? id,
        kind: "variable" as const,
      })),
      reported_as: reportedAs(row),
      footnote: footnote(
        "The denominator is every patient in the analysis population who had the outcome assessed.",
        avoided,
      ),
    };
  }

  if (comparable(row)) {
    // A repeated measure comes down the side by time point: that is the table a
    // mixed model is read from, and the one thing a reader wants from it is
    // whether the two arms diverge as time passes.
    //
    // Otherwise the outcome's own categories where it has them, one row
    // otherwise. Both lists come from the model, because the plan records them
    // as prose: "every 5 minutes during each phase of each session" and
    // "Binary (dead/alive), reported as a percentage per group" are neither of
    // them a list, and splitting them produced rows of nonsense for years.
    const repeated = row.pairing === "repeated" && ids.length === 1;
    const times: string[] = repeated ? (timepoints.get(ids[0]) ?? []) : [];
    const levels: string[] = times.length > 1
      ? times
      : ids.length === 1
        ? (categories.get(ids[0]) ?? [])
        : [];
    const header = levels.length > 1 ? (times.length > 1 ? "Time point" : subject) : "Outcome";
    return {
      ...base,
      columns: [
        header,
        ...contrastLevels(row, sap, groups),
        "Total",
        ...estimates,
        ...(withP ? ["P value"] : []),
      ],
      rows:
        levels.length > 1
          ? levels.map((level) => ({ label: level, kind: "category" as const }))
          : [{ label: subject, kind: "category" as const }],
      reported_as: reportedAs(row),
      footnote: footnote(
        "The denominator is every patient in the analysis population who had the outcome assessed. The Total column is the whole cohort, before it is split.",
        avoided,
      ),
    };
  }

  // No groups to put across the top: a correlation, an agreement, a repeated
  // measure, or a single arm. The estimates become the rows instead.
  if (measures.length && hasContrast(row)) {
    const levels = contrastLevels(row, sap, groups);
    const contrast = levels.length === 2 ? ` (${levels[0]} vs ${levels[1]})` : "";
    return {
      ...base,
      title: capitalise(
        by ? `Effect of ${by} on ${subject}${denominator(sap)}` : `${subject}, estimated${denominator(sap)}`,
      ),
      columns: ["Measure", "Estimate", "95% CI", ...(withP ? ["P value"] : [])],
      rows: measures.map((measure) => ({
        label: `${measure}${contrast}`,
        kind: "measure" as const,
      })),
      footnote: footnote(avoided),
    };
  }

  // A single group, described. There is nothing to compare it with, so there
  // is nothing to estimate either.
  const levels: string[] = ids.length === 1 ? (categories.get(ids[0]) ?? []) : [];
  return {
    ...base,
    columns: [levels.length > 1 ? subject : "Outcome", ...summaryColumns(row)],
    rows:
      levels.length > 1
        ? levels.map((level) => ({ label: level, kind: "category" as const }))
        : [{ label: subject, kind: "category" as const }],
    reported_as: reportedAs(row),
    footnote:
      "The denominator is every patient in the analysis population who had the outcome assessed.",
  };
}

function adjustedTable(
  row: AnalysisRow,
  tier: Tier,
  ctx: BlockContext,
): ShellTable | null {
  const models = adjustmentSet(row);
  if (!models.length) return null;

  const { sap } = ctx;
  const variables = variableIndex(sap);
  const ids = row.outcome_ids ?? [];
  const by = exposurePhrase(row, sap);
  const subject = subjectOf(row, sap);
  const measure = headlineMeasure(row);

  const terms = [...(row.exposure_ids ?? []), ...(row.adjust_for_ids ?? [])];
  const rows: TableRow[] = terms.map((id) => ({
    variable_id: variables.has(id) ? id : undefined,
    label: variables.get(id)?.label ?? id,
    kind: "model_term" as const,
  }));

  // Ten events per degree of freedom. A model the study cannot support is said
  // to be exploratory here, before the data arrive, rather than discovered at
  // analysis and quietly reported anyway.
  const dfNote = sap.expected_events
    ? degreesOfFreedomNote(sap.expected_events, terms.length).note
    : "";

  return {
    number: 0,
    block: BLOCK_OF[tier],
    role: "effect_adjusted",
    if_missing: IF_MISSING.effect_adjusted,
    outcome_id: ids.length === 1 ? ids[0] : undefined,
    fills: row.objective_ids?.length ? [...row.objective_ids] : undefined,
    models,
    title: capitalise(
      `Effect of ${by || "the study groups"} on ${subject}, adjusted${denominator(sap)}`,
    ),
    // The crude and the adjusted estimate on one row, per predictor, each with
    // its interval and its own p value, so a reader can see what the adjustment
    // did without holding two tables side by side.
    columns: [
      "Predictor",
      `Unadjusted ${lower(measure)} (95% CI)`,
      "P value",
      `Adjusted ${lower(measure)} (95% CI)`,
      "P value",
    ],
    rows,
    test_applied: planOf(row).test_adjusted ?? planOf(row).test,
    footnote: [
      `The adjusted column holds constant: ${
        (row.adjust_for_ids ?? []).map((id) => variables.get(id)?.label ?? id).join(", ")
      }.`,
      dfNote,
    ]
      .filter(Boolean)
      .join(" "),
  };
}

function subgroupTable(row: AnalysisRow, tier: Tier, ctx: BlockContext): ShellTable | null {
  const subgroups = ctx.sap.subgroups ?? [];
  if (!subgroups.length) return null;
  // Effect modification needs an effect. A single proportion has none.
  if (!hasContrast(row)) return null;

  const { sap, groups } = ctx;
  const ids = row.outcome_ids ?? [];
  const by = exposurePhrase(row, sap);
  const subject = subjectOf(row, sap);
  const measure = headlineMeasure(row);
  const per = row.data_type === "binary" ? "n/N (%)" : "summary";

  return {
    number: 0,
    // Exploratory, not primary. A subgroup analysis is not powered, is not
    // corrected for multiplicity and generates a hypothesis rather than
    // settling one, which is what its own footnote has always said. Printing it
    // beside the primary result invited it to be read as one.
    block: "exploratory",
    role: "subgroup",
    if_missing: IF_MISSING.subgroup,
    outcome_id: ids.length === 1 ? ids[0] : undefined,
    fills: row.objective_ids?.length ? [...row.objective_ids] : undefined,
    title: capitalise(
      `Effect of ${by || "the study groups"} on ${subject} within prespecified subgroups${denominator(sap)}`,
    ),
    columns: [
      "Subgroup",
      ...contrastLevels(row, sap, groups).map((g) => `${g} ${per}`),
      `${measure} (95% CI)`,
      "Interaction p",
    ],
    rows: subgroups.map((s) => ({ label: s.subgroup, kind: "subgroup" as const })),
    test_applied: planOf(row).test_adjusted ?? planOf(row).test,
    footnote:
      "Effect modification is read from the interaction p value, not from the p value within each subgroup. These analyses are not powered and are hypothesis-generating.",
  };
}

function sensitivityTable(
  row: AnalysisRow,
  tier: Tier,
  ctx: BlockContext,
  required: boolean,
): ShellTable | null {
  const { sap } = ctx;
  const declared = sap.populations ?? [];
  const missing = sap.rules?.missing_data?.trim();
  if (declared.length < 2 && !missing && !required) return null;

  // A design that owes this table owes it whether or not the plan remembered to
  // name its populations. A trial is read as intention to treat and checked
  // against per protocol; saying so here is better than omitting the table
  // because one field was left empty.
  const populations = declared.length
    ? declared
    : required
      ? [
          { name: "Intention to treat (primary)", definition: "" },
          { name: "Per protocol", definition: "" },
        ]
      : [];

  const ids = row.outcome_ids ?? [];
  const subject = subjectOf(row, sap);
  const plan = planOf(row);
  const measures = plan.measures.slice(0, 2);
  if (!measures.length) return null;

  const rows: TableRow[] = populations.map((p) => ({
    label: p.name,
    kind: "population" as const,
  }));
  if (row.adjust_for_ids?.length) {
    rows.push({ label: "Adjusted estimate, against the unadjusted", kind: "population" });
  }
  if (missing) {
    rows.push({ label: "Missing outcome data, best case", kind: "population" });
    rows.push({
      label: "Missing outcome data, worst case (tipping point)",
      kind: "population",
    });
  }

  return {
    number: 0,
    block: BLOCK_OF[tier],
    role: "sensitivity",
    if_missing: IF_MISSING.sensitivity,
    outcome_id: ids.length === 1 ? ids[0] : undefined,
    fills: row.objective_ids?.length ? [...row.objective_ids] : undefined,
    title: capitalise(`Sensitivity analyses for ${subject}${denominator(sap)}`),
    columns: ["Analysis", ...measures.map((m) => `${m} (95% CI)`)],
    rows,
    test_applied: plan.test,
    footnote: [
      "The first row is the primary analysis. Every other row repeats it a different defensible way, and a conclusion that changes between them is one the data will not carry.",
      missing ? `Missing data: ${missing}` : "",
    ]
      .filter(Boolean)
      .join(" "),
  };
}

/**
 * Every analytic table the plan implies, unnumbered.
 *
 * The caller merges these with the descriptive tables the model laid out and
 * numbers the result, because numbering cannot be settled until both halves
 * exist.
 */
export function buildAnalyticTables(
  sap: SapRegistry,
  groups: string[],
  categories: Map<string, string[]> = new Map(),
  timepoints: Map<string, string[]> = new Map(),
): ShellTable[] {
  const objectives = new Map((sap.objectives ?? []).map((o) => [o.id, o]));
  const ctx: BlockContext = {
    sap,
    groups: groups.length ? groups : ["All patients"],
    categories,
    timepoints,
  };

  const ordered = [...(sap.analyses ?? [])].sort(
    (a, b) => TIER_RANK[tierOf(a, objectives)] - TIER_RANK[tierOf(b, objectives)],
  );

  // Effect modification needs an effect to modify. Usually that is the primary
  // analysis, but not always: a study whose primary objective is a single
  // proportion carries its comparison on a secondary row, and hanging the
  // subgroup table off the proportion would ask which subgroup modified a
  // number that nothing is being compared against.
  const headline = ordered.find(hasContrast);

  // The sensitivity table repeats the study's primary analysis every other
  // defensible way. One for the study, like the subgroup table beside it: the
  // rule was written in a comment and enforced only for the subgroup, so a
  // study with seven primary-tier rows printed seven of them.
  const sensitivityRow = ordered.find((r) => tierOf(r, objectives) === "primary");

  // What the design owes. A trial owes a subgroup table and a sensitivity
  // table; a cohort owes person-time and an attrition table instead. The plan
  // can add to that floor but not fall below it: a study that declares
  // subgroups gets a subgroup table whether or not its design demands one.
  const required = new Set(designRule(sap.design_family).roles);
  const wants = (role: TableRole, alsoWhen = false) => required.has(role) || alsoWhen;
  // A design the plan never classified falls to the catalogue's `any` row,
  // which carries the tables every comparative study needs, so an unclassified
  // plan behaves exactly as it did before the catalogue existed.

  /**
   * Whether an objective asks what caused something, or only how much of it
   * there was. A descriptive objective is reported and not modelled: an
   * adjusted estimate beneath it claims more than the question asked.
   */
  const isCausal = (row: AnalysisRow) =>
    (row.objective_ids ?? []).some((id) => objectives.get(id)?.intent === "causal");

  const out: ShellTable[] = [];
  if (required.has("flow")) {
    out.push(flowTable(sap, ctx.groups, RANDOMISED.has(sap.design_family ?? "")));
  }

  for (const row of ordered) {
    const tier = tierOf(row, objectives);
    // Which way round the table goes is decided by the question, not by the
    // design: a study hunting predictors groups by its outcome.
    // Never gated on the design catalogue. The catalogue is a floor of what a
    // design owes and was being read as a licence: descriptive epidemiology
    // does not list `outcome`, so a study with sixteen analyses got no outcome
    // table at all and a document of seven sensitivity analyses.
    const laidOut: (ShellTable | null)[] = isPredictorHunt(row)
      ? predictorTables(row, tier, ctx)
      : // One table, not three. The whole-cohort count is its Total column and
        // the estimates are its right-hand columns.
        [outcomeTable(row, tier, ctx)];

    const block: (ShellTable | null)[] = [
      ...laidOut,
      // The primary question is the study's reason for existing, so it carries
      // its adjusted estimate wherever the plan names confounders. A secondary
      // one carries it only where the objective says it is causal.
      wants("effect_adjusted") && (tier === "primary" || isCausal(row))
        ? adjustedTable(row, tier, ctx)
        : null,
    ];

    // One subgroup table and one sensitivity table for the study, not one per
    // outcome. Neither is powered, and repeating them down every secondary
    // outcome would treble the document without adding a finding.
    if (row === headline && wants("subgroup", (sap.subgroups ?? []).length > 0)) {
      block.push(subgroupTable(row, tier, ctx));
    }
    if (row === sensitivityRow && wants("sensitivity", (sap.populations ?? []).length > 1)) {
      block.push(sensitivityTable(row, tier, ctx, required.has("sensitivity")));
    }

    out.push(...block.filter((t): t is ShellTable => Boolean(t)));
  }
  return out;
}

/* ---- merging the two halves --------------------------------------- */

const BLOCK_ORDER = ["descriptive", "primary", "secondary", "exploratory"];

/**
 * Within one outcome, the order a reader needs: how many had the outcome, what
 * the crude effect was, what held constant changed it, whether it differed by
 * subgroup, and whether it survives being analysed another way.
 */
const ROLE_ORDER = [
  "flow",
  "descriptive",
  "distribution",
  "summary",
  "repeated",
  "effect_unadjusted",
  "effect_adjusted",
  "accuracy",
  "subgroup",
  "sensitivity",
];

/**
 * Puts the two halves in reading order and numbers them.
 *
 * Numbering cannot be settled earlier. The model numbers its own tables before
 * it knows how many analytic tables the plan implies, and the plan wrote its
 * table ids before it knew how many baseline tables the study needed, so both
 * sets of numbers are provisional until here. `fills` is what actually carries
 * the link, and it survives the renumbering untouched.
 */
export function mergeTables(
  described: ShellTable[],
  analytic: ShellTable[],
  sap: SapRegistry,
): ShellTable[] {
  const outcomeRank = new Map((sap.outcomes ?? []).map((o, i) => [o.id, i]));
  const objectiveRank = new Map((sap.objectives ?? []).map((o, i) => [o.id, i]));

  // An objective's tables belong together. Ordering by outcome first scattered
  // a secondary objective's three tables between another objective's, so the
  // document read C1.1, C1.2, C2.1, C1.3 and no block was contiguous.
  const objectiveOf = (t: ShellTable) => {
    for (const id of t.fills ?? []) {
      if (objectiveRank.has(id)) return objectiveRank.get(id)!;
    }
    return Number.MAX_SAFE_INTEGER;
  };
  const outcomeOf = (t: ShellTable) =>
    t.outcome_id && outcomeRank.has(t.outcome_id)
      ? outcomeRank.get(t.outcome_id)!
      : Number.MAX_SAFE_INTEGER;

  // Two analysis rows that differ only in something the table cannot show
  // produce the same table twice. A plan that does that has a problem, but
  // printing the identical table twice is not how to say so.
  const seen = new Set<string>();
  const unique = [...described, ...analytic].filter((t) => {
    const key = JSON.stringify([t.role, t.fills, t.title, t.columns, t.rows]);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return unique
    .map((table, i) => ({ table, i }))
    .sort((a, b) => {
      const block = BLOCK_ORDER.indexOf(a.table.block) - BLOCK_ORDER.indexOf(b.table.block);
      if (block) return block;
      const objective = objectiveOf(a.table) - objectiveOf(b.table);
      if (objective) return objective;
      const outcome = outcomeOf(a.table) - outcomeOf(b.table);
      if (outcome) return outcome;
      const role = ROLE_ORDER.indexOf(a.table.role) - ROLE_ORDER.indexOf(b.table.role);
      if (role) return role;
      // Stable: two tables of the same role keep the order they arrived in.
      return a.i - b.i;
    })
    .map(({ table }, i) => ({ ...table, number: i + 1 }));
}
