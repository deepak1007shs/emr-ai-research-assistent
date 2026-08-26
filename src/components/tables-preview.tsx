import type { ShellTable, ShellTablesSpec, TableBlock } from "@/lib/tables/types";
import { line, plain } from "@/lib/render/plain";
import { DocSection, DocTable, DocumentShell, Note, Td } from "./document-shell";

/**
 * The shell tables, on screen.
 *
 * Mirrors tables-docx.ts: the four blocks in order, each table with the columns
 * and the row order the filled table will carry, and the cells empty. The empty
 * cells are the point, so they are drawn rather than collapsed away.
 */

const BLOCK_HEADING: Record<TableBlock, string> = {
  descriptive: "Descriptive and baseline characteristics",
  primary: "Primary outcome",
  secondary: "Secondary outcomes",
  exploratory: "Exploratory analyses",
};

const BLOCK_ORDER: TableBlock[] = ["descriptive", "primary", "secondary", "exploratory"];

export function TablesPreview({ spec }: { spec: ShellTablesSpec }) {
  const labelOf = (id: string, fallback: string) => spec.labels?.[id] ?? fallback ?? id;
  // Read back from a row, so the list is treated as possibly absent.
  const ordered = [...(spec.tables ?? [])].sort((a, b) => a.number - b.number);

  return (
    <DocumentShell kind="Shell Tables" title={plain(spec.title)}>
      <Note>
        Every table the study will report, with the cells empty. The columns and the row order are
        what the filled tables will carry, so nothing is left to decide once the data arrive.
      </Note>

      {BLOCK_ORDER.map((block) => {
        const inBlock = ordered.filter((t) => t.block === block);
        if (!inBlock.length) return null;

        return (
          <DocSection key={block} title={BLOCK_HEADING[block]}>
            {block === "exploratory" && (
              <Note>
                Exploratory analyses are hypothesis-generating. They are not powered and must not
                be reported as confirmatory findings.
              </Note>
            )}
            {inBlock.map((table) => (
              <ShellTableBlock key={table.number} table={table} labelOf={labelOf} />
            ))}
          </DocSection>
        );
      })}
    </DocumentShell>
  );
}

function ShellTableBlock({
  table,
  labelOf,
}: {
  table: ShellTable;
  labelOf: (id: string, fallback: string) => string;
}) {
  const width = (table.columns ?? []).length;

  return (
    <div className="space-y-2">
      <h3 className="text-xs font-semibold">
        Table {table.number}: {line(table.title)}
      </h3>

      <DocTable headers={table.columns ?? []}>
        {(table.rows ?? []).map((row, i) => {
          const label = row.variable_id ? labelOf(row.variable_id, row.label) : row.label;

          if (row.heading) {
            // A variable heading spans the table; its categories carry the numbers.
            return (
              <tr key={i}>
                <Td bold span={width}>
                  {line(label)}
                </Td>
              </tr>
            );
          }

          return (
            <tr key={i}>
              <Td indent={row.indent}>{line(label)}</Td>
              {/* Empty on purpose. This is a shell, not a result. */}
              {Array.from({ length: width - 1 }, (_, c) => (
                <Td key={c} centre>
                  &nbsp;
                </Td>
              ))}
            </tr>
          );
        })}
      </DocTable>

      {table.test_applied && <Note>Test applied: {plain(table.test_applied)}</Note>}
      {table.footnote && <Note>{plain(table.footnote)}</Note>}
    </div>
  );
}
