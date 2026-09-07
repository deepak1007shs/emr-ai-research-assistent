/**
 * A dataset somebody has already collected, on its way to being analysable.
 *
 * The shapes here are the contract between four steps that must not know each
 * other's internals: reading a file into a grid, profiling the grid, asking the
 * model the three questions only it can answer, and cleaning the grid from
 * those answers. Only the profile is ever sent to a model, so a sheet of five
 * thousand rows costs what a sheet of fifty does.
 */

/** A cell as it was found. Everything is text until something decides otherwise. */
export type Cell = string;

/** One sheet of a workbook, exactly as it was read: no rows dropped, no trimming. */
export type Grid = {
  /** The sheet's name, or the filename for a CSV. */
  sheet: string;
  rows: Cell[][];
};

/** What one column looks like, which is all the model is shown of it. */
export type ColumnProfile = {
  /** Position in the sheet, from 0, so a rename cannot lose track of it. */
  index: number;
  /** The header as written, which may be empty, duplicated or a whole sentence. */
  header: string;
  filled: number;
  missing: number;
  /** What the values look like, decided by counting rather than by opinion. */
  looks: "number" | "date" | "category" | "text" | "empty";
  /** Up to fifty distinct values, most frequent first, with the total. */
  distinct: { value: string; count: number }[];
  distinctTotal: number;
  /** The markers standing for "not recorded" that were actually seen here. */
  missingMarkers: string[];
};

export type DatasetProfile = {
  sheet: string;
  /** The row the headers are on, from 0. */
  headerRow: number;
  rowCount: number;
  columns: ColumnProfile[];
};

/**
 * The model's answers, and nothing else.
 *
 * It decides which column is which variable and which spellings are one
 * category. It never returns a cell: every transformation is applied by code
 * from what is here, so the same file cleans the same way twice.
 */
export type Interpretation = {
  columns: ColumnMapping[];
};

export type ColumnMapping = {
  index: number;
  /** The plan's variable id, when this column is one. Empty when it is not. */
  variable_id: string;
  /** What to call the column when no variable claims it. */
  clean_name: string;
  /** One sentence for the data dictionary. */
  meaning: string;
  unit: string;
  /**
   * The spellings that mean one thing, and what to print for them.
   *
   * `{ canonical: "Male", spellings: ["m", "male", "MALE"] }`. Matched without
   * case or surrounding space; the canonical form is written as text, never as
   * a number, because a coded column is what the investigator asked not to get.
   */
  categories: { canonical: string; spellings: string[] }[];
};

/** A cell this application changed, and why. Every change appears here. */
export type Change = {
  /** The row as the spreadsheet numbers it, so a person can go and look. */
  row: number;
  column: string;
  before: string;
  after: string;
  rule: string;
};

/** Something only the investigator can settle. Never changed, always listed. */
export type Finding = {
  severity: "ERROR" | "WARN";
  code: string;
  column: string;
  /** Empty where the finding is about the column rather than one row. */
  row: number | null;
  message: string;
};

export type CleanedDataset = {
  /** The header row, renamed, followed by the cleaned rows. */
  headers: string[];
  rows: Cell[][];
  changes: Change[];
  findings: Finding[];
  dictionary: DictionaryEntry[];
};

export type DictionaryEntry = {
  column: string;
  meaning: string;
  type: ColumnProfile["looks"];
  unitsOrCategories: string;
  missing: string;
};
