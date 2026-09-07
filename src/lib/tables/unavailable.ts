import type { ShellTablesSpec } from "./types.ts";

/**
 * What the collected data cannot fill, marked on the tables that would report it.
 *
 * A set difference between the variables the plan declares and the columns a
 * dataset was found to hold, so it is taken here rather than asked of a model.
 * Getting it wrong means telling an investigator a table can be filled when
 * nobody collected the values, and that is discovered at analysis.
 *
 * Nothing is dropped and nothing is renumbered. The plan is still the plan: a
 * table the objectives call for keeps its place and its number, so a dataset
 * arriving later fills the gap without the document changing shape. What the
 * reader gains is knowing, while reading the table, which lines today's data
 * cannot supply.
 */

const ROW_NOTE = "not collected";
const TABLE_NOTE =
  "The collected data fills none of this table. Every variable it reports is missing from the dataset, so this objective cannot be answered with what exists.";

export function markUnavailable(
  spec: ShellTablesSpec,
  /** Variable id to the column that holds it, from the mapped dataset. */
  columns: Record<string, string>,
): ShellTablesSpec {
  // No dataset means nothing is known about what was collected, which is not
  // the same as nothing having been collected. An unmapped study must not read
  // as a study missing everything.
  if (!Object.keys(columns).length) return spec;

  const tables = spec.tables.map((table) => {
    const rows = table.rows.map((row) =>
      row.variable_id && !columns[row.variable_id]
        ? { ...row, unavailable: ROW_NOTE }
        : row,
    );

    // A table of nothing but missing variables is one dead objective rather
    // than four separate problems, and reads faster said once at the top.
    const reporting = rows.filter((row) => row.variable_id);
    const allMissing = reporting.length > 0 && reporting.every((row) => row.unavailable);

    return { ...table, rows, ...(allMissing ? { unavailable: TABLE_NOTE } : {}) };
  });

  return { ...spec, tables };
}
