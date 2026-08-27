/**
 * The shell tables.
 *
 * A shell table is the table the results will fill, with the cells empty.
 * Everything a filled table carries is decided here, so that when the data
 * arrive nothing is left to choose.
 */

/** Where a table sits in the printed document. */
export type TableBlock = "descriptive" | "primary" | "secondary" | "exploratory";

/**
 * What a table is for.
 *
 * One outcome is not one table, and one design is not another design's document.
 * A primary outcome is reported by a block, each table with a different job and
 * therefore a different shape: the summary table's rows are the groups, the
 * effect table's rows are estimates, the adjusted table's rows are predictors,
 * the subgroup table's rows are subgroups, the sensitivity table's rows are ways
 * of analysing the same data. Which of them a study needs is decided by its
 * design, in `design-tables.md`.
 *
 * The vocabulary is the reference document's, so a role named here that nothing
 * yet builds is a gap this app can name rather than one it hides.
 */
export type TableRole =
  /* ---- the tables every comparative study reports ---- */
  /** Who was in the study. The baseline table. */
  | "descriptive"
  /** The outcome by group, with the denominators the effect is computed from. */
  | "summary"
  /** The effect before adjustment. Rows are estimates. */
  | "effect_unadjusted"
  /** The effect with confounders held constant. */
  | "effect_adjusted"
  /** Which pair differs, and by how much. Rows are pairwise comparisons. */
  | "post_hoc"
  /** The effect within subgroups, read from an interaction term. */
  | "subgroup"
  /** The same question analysed other defensible ways. */
  | "sensitivity"
  /** One outcome's categories and how many fall in each. */
  | "distribution"
  /** A measure repeated across time points. */
  | "repeated"
  /** How many entered, how many were analysed, and where the rest went. */
  | "flow"
  /** Shapiro-Wilk and skewness, which decide the parametric choice. */
  | "normality"
  /** Variance inflation and tolerance for the predictors of a model. */
  | "collinearity"
  /** How much is missing, where, and what was done about it. */
  | "missing_data"

  /* ---- trial variants ---- */
  /** Harms by arm. */
  | "adverse_events"
  /** The difference against the prespecified margin, with a conclusion row. */
  | "non_inferiority"
  /** Period and sequence effects, and the test for carryover. */
  | "carryover"
  /** The intracluster correlation and the design effect. */
  | "icc"
  /** Both main effects and the interaction term of a factorial design. */
  | "interaction"

  /* ---- cohort and case-control ---- */
  /** Events over person-time, and the incidence rate ratio. */
  | "incidence"
  /** The effect across ordered categories of exposure, with a trend test. */
  | "dose_response"
  /** Those lost to follow-up against those retained. */
  | "attrition"
  /** The concordant and discordant pairs of a matched design. */
  | "matched"

  /* ---- prevalence designs ---- */
  /** How common the condition is, with its interval. */
  | "prevalence"
  /** The rate standardised to a named standard population. */
  | "standardised"
  /** The rate over calendar time, with a test for trend. */
  | "trend"

  /* ---- diagnostic accuracy ---- */
  /** The index test cross-classified against the reference standard. */
  | "two_by_two"
  /** Sensitivity, specificity, predictive values and likelihood ratios. */
  | "accuracy"
  /** Area under the curve, and the cut-off it selects. */
  | "roc"
  /** Performance at cut-offs other than the chosen one. */
  | "cutoffs"

  /* ---- agreement and reliability ---- */
  /** Two observers cross-classified. */
  | "cross_classification"
  /** Kappa, the intraclass correlation, Bland-Altman bias and limits. */
  | "agreement"
  /** Item-total correlations and alpha with each item deleted. */
  | "internal_consistency"

  /* ---- survival ---- */
  /** Follow-up, events and censoring. */
  | "survival_summary"
  /** Survival at fixed times, with the numbers still at risk. */
  | "life_table"
  /** Whether the hazards are proportional. */
  | "ph_test"

  /* ---- systematic review ---- */
  /** Study selection, as PRISMA counts it. */
  | "prisma"
  /** What each included study was. */
  | "study_characteristics"
  /** Risk of bias per study, per domain. */
  | "risk_of_bias"
  /** The pooled estimate, with Q, I-squared and tau-squared. */
  | "pooled"
  /** Whether the pooled estimate survives subgrouping, and whether it is biased. */
  | "publication_bias";

/** What a row stands for. Absent means a variable or one of its categories. */
export type TableRowKind =
  | "variable"
  | "category"
  /** An estimate: a risk ratio, a mean difference, a number needed to treat. */
  | "measure"
  /** A subgroup the effect is reported within. */
  | "subgroup"
  /** An analysis population, or a way of handling missing data. */
  | "population"
  /** A term in an adjusted model. */
  | "model_term";

export type TableRow = {
  /**
   * The variable this row reports, by id, when the plan declares one. The
   * wording is then read from the registry, so a baseline table cannot call a
   * variable something the form does not call it.
   */
  variable_id?: string;
  /** Used when no variable_id applies: a sub-row such as "Mean +/- SD", or a category. */
  label: string;
  kind?: TableRowKind;
  /**
   * A sub-row sits under a variable heading: "Mean ± SD" under Age, or each
   * category under Sex. The heading row itself has no cells to fill.
   */
  indent?: boolean;
  /** True for a heading row, which spans the table and carries no data cells. */
  heading?: boolean;
};

/**
 * A model reported by an adjusted table.
 *
 * Normally one: the adjusted column, and what it holds constant. It is a list
 * rather than a flat set of ids so that a plan reporting more than one model
 * can say which variables belong to which, and so that a model is always named
 * by what it holds constant rather than by a number.
 */
export type TableModel = {
  /** What the model says it estimates, e.g. "Adjusted". Never "Model 1". */
  name: string;
  /** The variable ids this model holds constant. */
  adds: string[];
};

export type ShellTable = {
  number: number;
  block: TableBlock;
  role: TableRole;
  /** The outcome this table reports, by id. Absent on a descriptive table. */
  outcome_id?: string;
  /**
   * The objectives this table reports, by id.
   *
   * The plan numbers its own tables before anyone knows how many baseline
   * tables there will be, so the two documents cannot agree on a number. They
   * agree on this instead: the tables document owns the numbering, and says
   * which analyses each of its tables answers. Several tables may fill one
   * objective, provided each has a different job.
   */
  fills?: string[];
  /**
   * The models an adjusted table reports. Checked against the analysis that
   * fills the table, so an adjustment set cannot drift from the one the plan
   * declared.
   */
  models?: TableModel[];
  /** The full title, including the denominator: "... by CR-POPF status (n = 30)". */
  title: string;
  /** The column headers, exactly as they will print. */
  columns: string[];
  rows: TableRow[];
  /** "Footnote: test used = Pearson chi-square test." Printed under the table. */
  test_applied?: string;
  footnote?: string;
};

export type ShellTablesSpec = {
  title: string;
  /**
   * id to label, copied from the analysis plan's registry when the tables are
   * built. Written by code, never retyped by the model.
   */
  labels: Record<string, string>;
  /**
   * How the groups are named in every column header, e.g. "CR-POPF" and
   * "No CR-POPF".
   *
   * Used as the fallback when an analysis has no categorical exposure to take
   * its arms from. It is only a fallback because the two are not always the
   * same thing: an observational study often lays its baseline table out by
   * outcome, and an effect table that took its columns from there would report
   * the exposure's effect across the levels of the outcome.
   */
  groups: string[];
  tables: ShellTable[];
};

/** Every variable any model on this table holds constant. */
export function adjustedIds(table: Pick<ShellTable, "models">): string[] {
  return [...new Set((table.models ?? []).flatMap((m) => m.adds))];
}

/**
 * Which tables report each objective.
 *
 * An objective usually fills several: the incidence, the unadjusted estimate,
 * the adjusted model, and any subgroup or sensitivity table beside them.
 *
 * The plan writes a provisional table id against every analysis before anyone
 * knows how many baseline tables the study needs. Once the shell tables exist
 * they are the authority, and this is how the plan is told what its numbers
 * really are.
 */
export function tableNumbers(
  spec: ShellTablesSpec | null | undefined,
): Record<string, number[]> {
  const numbers: Record<string, number[]> = {};
  for (const table of spec?.tables ?? []) {
    for (const objectiveId of table.fills ?? []) {
      numbers[objectiveId] = [...(numbers[objectiveId] ?? []), table.number];
    }
  }
  for (const key of Object.keys(numbers)) {
    numbers[key] = [...new Set(numbers[key])].sort((a, b) => a - b);
  }
  return numbers;
}
