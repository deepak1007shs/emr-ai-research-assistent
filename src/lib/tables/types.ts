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
  /** How the groups are named in every column header, e.g. "CR-POPF" and "No CR-POPF". */
  groups: string[];
  tables: ShellTable[];
};
