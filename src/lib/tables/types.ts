/**
 * The shell tables: every table the study will report, with the cells empty.
 *
 * Shaped from the results documents this house produces, so a filled table and a
 * shell table have the same columns and the same row order.
 */

export type TableBlock = "descriptive" | "primary" | "secondary" | "exploratory";

export type TableKind =
  /** Variable by group, with a p value. The baseline table. */
  | "descriptive"
  /** An outcome compared between groups. */
  | "comparative"
  /** Unadjusted and adjusted effect sizes side by side. */
  | "effect"
  /** Sensitivity, specificity, predictive values. */
  | "accuracy"
  /** One outcome's categories and how many fall in each. */
  | "distribution"
  /** A measure repeated across time points. */
  | "repeated";

export type TableRow = {
  /**
   * The variable this row reports, by id, when the plan declares one. The
   * wording is then read from the registry, so a baseline table cannot call a
   * variable something the form does not call it.
   */
  variable_id?: string;
  /** Used when no variable_id applies: a sub-row such as "Mean +/- SD", or a category. */
  label: string;
  /**
   * A sub-row sits under a variable heading: "Mean ± SD" under Age, or each
   * category under Sex. The heading row itself has no cells to fill.
   */
  indent?: boolean;
  /** True for a heading row, which spans the table and carries no data cells. */
  heading?: boolean;
};

export type ShellTable = {
  number: number;
  block: TableBlock;
  /** The outcome this table reports, by id. Absent on a descriptive table. */
  outcome_id?: string;
  /**
   * The objectives this table reports, by id.
   *
   * The plan numbers its own tables before anyone knows how many baseline
   * tables there will be, so the two documents cannot agree on a number. They
   * agree on this instead: the tables document owns the numbering, and says
   * which analyses each of its tables answers.
   */
  fills?: string[];
  /**
   * The variable ids the adjusted column adjusts for. Checked against the
   * analysis that fills this table, so the adjustment set cannot drift from the
   * one the plan declared.
   */
  adjusted_for?: string[];
  /** The full title, including the denominator: "... by CR-POPF status (n = 30)". */
  title: string;
  kind: TableKind;
  /** The column headers, exactly as they will print. */
  columns: string[];
  rows: TableRow[];
  /** "Test applied: Pearson chi-square test." Printed under the table. */
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
  /** How the groups are named in every column header, e.g. "CR-POPF" and "No CR-POPF". */
  groups: string[];
  tables: ShellTable[];
};

/**
 * Which table reports each objective.
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
      // An objective often fills more than one: the unadjusted estimate, the
      // adjusted model, and any sensitivity table beside them.
      numbers[objectiveId] = [...(numbers[objectiveId] ?? []), table.number];
    }
  }
  for (const key of Object.keys(numbers)) numbers[key].sort((a, b) => a - b);
  return numbers;
}
