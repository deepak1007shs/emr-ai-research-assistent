/**
 * A table said in words rather than drawn.
 *
 * Shared by the .docx and the screen so the two cannot describe the same table
 * differently. The document used to draw empty grids, and an empty grid does
 * not say what belongs in it: one baseline table ran to 28 rows labelled "",
 * "Mean +/- SD", "", "Median (IQR)", readable only by resolving ids the reader
 * could not see.
 */

import type { ShellTable, ShellTablesSpec } from "./types.ts";

/**
 * The five lines the house blueprint puts under every table.
 *
 * The labels are its labels, including which axis is called which: it writes
 * "Rows (X)" and "Columns (Y)", and a document that renamed them would not
 * match the one a supervisor already reads.
 */
export type Described = {
  /** "Rows (X)": what runs down the left side. */
  rows: string;
  /** "Columns (Y)": what runs across the top. */
  columns: string;
  /** "Cell shows": the statistic inside each cell. */
  reported?: string;
  /** "Test applied": the test or model, and anything the plan ruled out. */
  analysis?: string;
  /** "If data are missing": what is done, decided before the data are seen. */
  missing?: string;
};

/**
 * The row list as a sentence.
 *
 * A sub-row belongs to the heading above it: a row carrying a variable and no
 * label, followed by an indented "Mean +/- SD", is one thing to a reader and
 * two rows to the data. They are folded back together here, which is the whole
 * reason this is not simply a join.
 */
/**
 * The rows, folded, one string each.
 *
 * Shared with the drawn grid, so a row reads the same whether it is a name in a
 * sentence or the first cell of a table. Drawing them straight is what the
 * first attempt at a grid did, and "" followed by "Mean +/- SD" is two rows to
 * the data and one thing to a reader.
 */
export function rowLabels(
  table: ShellTable,
  labelOf: (id: string, fallback: string) => string,
  /** Variable id to datasheet column, from the form. Empty without one. */
  columnOf: (id: string) => string | undefined = () => undefined,
): string[] {
  const parts: string[] = [];
  /** The mark for each part, by the same index, applied once folding is done. */
  const marks: (string | undefined)[] = [];

  for (const row of table.rows) {
    const named = row.variable_id ? labelOf(row.variable_id, row.label) : row.label;
    // The datasheet column beside the label, so the analyst does not have to
    // work out which spreadsheet column a row means. Square brackets, because
    // the round ones already hold a variable's parts, and "Age (age, mean +/-
    // SD)" does not say which of the two the column is called.
    const column = row.variable_id ? columnOf(row.variable_id) : undefined;
    const label = (column ? `${named} [${column}]` : named).trim();
    if (!label) continue;

    if (row.indent && parts.length) {
      // "Age" + "Mean +/- SD" reads as "Age (mean +/- SD)".
      const last = parts.length - 1;
      const inner = label.replace(/^\(|\)$/g, "");
      parts[last] = parts[last].endsWith(")")
        ? `${parts[last].slice(0, -1)}, ${lower(inner)})`
        : `${parts[last]} (${lower(inner)})`;
      continue;
    }
    parts.push(label);
    marks.push(row.unavailable);
  }

  // Appended last, so it reads after the categories a sub-row folded on rather
  // than between the variable and them.
  return parts.map((part, i) => (marks[i] ? `${part} - ${marks[i]}` : part));
}

export function rowsSentence(
  table: ShellTable,
  labelOf: (id: string, fallback: string) => string,
  columnOf: (id: string) => string | undefined = () => undefined,
): string {
  return rowLabels(table, labelOf, columnOf).join(", ");
}

const lower = (s: string) => (s && s[0] === s[0].toUpperCase() && !isAcronym(s) ? s[0].toLowerCase() + s.slice(1) : s);

/** "IQR" and "SD" keep their capitals; "Mean" does not. */
function isAcronym(s: string): boolean {
  const first = s.split(/\s+/)[0] ?? "";
  return first.length > 1 && first === first.toUpperCase();
}

export function describe(
  table: ShellTable,
  labelOf: (id: string, fallback: string) => string,
  columnOf: (id: string) => string | undefined = () => undefined,
): Described {
  const rows = rowsSentence(table, labelOf, columnOf);
  // The first column heads the row labels rather than holding data, so it is
  // named as what the rows are and not repeated as a column.
  const columns = table.columns.slice(1).join(", ");

  const analysis = [
    table.test_applied ? table.test_applied.replace(/\.$/, "") + "." : "",
    table.footnote,
  ]
    .filter(Boolean)
    .join(" ");

  return {
    rows: rows || "TODO: this table has no rows.",
    columns: columns || table.columns.join(", "),
    reported: table.reported_as,
    analysis: analysis || undefined,
    missing: table.if_missing,
  };
}

/** "This study reports 14 tables." with their names, before any of them. */
export function contents(spec: ShellTablesSpec): { number: number; slot?: string; title: string }[] {
  return [...(spec.tables ?? [])]
    .sort((a, b) => a.number - b.number)
    .map((t) => ({ number: t.number, slot: t.slot, title: t.title }));
}

/**
 * Both directions of the objective-to-table check.
 *
 * Every objective must lead to at least one table, and every table must trace
 * back to at least one objective. The house blueprint runs this before it is
 * signed off, and it is the one check that catches the two failures nothing
 * else does: a question the document never answers, and a table nobody asked
 * for. Code can do it in full, because both halves are already ids.
 */
export function coverage(
  spec: ShellTablesSpec,
  objectiveIds: string[],
): {
  answered: { id: string; question: string; tables: number[] }[];
  unanswered: { id: string; question: string }[];
  orphans: { number: number; title: string }[];
} {
  const tables = [...(spec.tables ?? [])].sort((a, b) => a.number - b.number);
  const nameOf = (id: string) => spec.labels?.[id] ?? id;

  const answered: { id: string; question: string; tables: number[] }[] = [];
  const unanswered: { id: string; question: string }[] = [];

  for (const id of objectiveIds) {
    const numbers = tables.filter((t) => (t.fills ?? []).includes(id)).map((t) => t.number);
    if (numbers.length) answered.push({ id, question: nameOf(id), tables: numbers });
    else unanswered.push({ id, question: nameOf(id) });
  }

  // A descriptive table answers the reporting guideline rather than an
  // objective, so it is not an orphan; anything else with no objective is.
  const orphans = tables
    .filter((t) => t.block !== "descriptive" && !(t.fills ?? []).length)
    .map((t) => ({ number: t.number, title: t.title }));

  return { answered, unanswered, orphans };
}
