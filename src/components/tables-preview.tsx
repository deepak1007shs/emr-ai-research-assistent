import type { ShellTable, ShellTablesSpec, TableBlock } from "@/lib/tables/types";
import { line, plain } from "@/lib/render/plain";
import { AlertTriangleIcon } from "./icons";
import { DocTable, DocumentShell, Note, Td } from "./document-shell";

/**
 * The shell tables, on screen.
 *
 * Mirrors tables-docx.ts: the four blocks in order, each table with the columns
 * and the row order the filled table will carry, and the cells empty. The empty
 * cells are the point, so they are drawn rather than collapsed away, and set
 * faint so a reader can see at a glance that nothing has been filled in.
 *
 * Each table carries an anchor, so a finding in the review rail can send you to
 * the table it is about.
 */

const BLOCK_HEADING: Record<TableBlock, string> = {
  descriptive: "Descriptive and baseline characteristics",
  primary: "Primary outcome",
  secondary: "Secondary outcomes",
  exploratory: "Exploratory analyses",
};

const BLOCK_ORDER: TableBlock[] = ["descriptive", "primary", "secondary", "exploratory"];

/** The tier badge, which says at a glance what a table is for. */
const TIER: Record<TableBlock, { label: string; className: string }> = {
  descriptive: { label: "Descriptive", className: "bg-line-2 text-ink-2" },
  primary: { label: "Primary", className: "bg-brand-50 text-brand-ink" },
  secondary: { label: "Secondary", className: "bg-brand-50 text-brand-ink" },
  exploratory: { label: "Exploratory", className: "bg-line-2 text-ink-2" },
};

export function TablesPreview({
  spec,
  /** Table numbers a finding flagged, so the reader shows what the rail says. */
  flagged = new Set<number>(),
}: {
  spec: ShellTablesSpec;
  flagged?: Set<number>;
}) {
  const labelOf = (id: string, fallback: string) => spec.labels?.[id] ?? fallback ?? id;
  const ordered = [...(spec.tables ?? [])].sort((a, b) => a.number - b.number);

  return (
    <DocumentShell
      kind="Section 6 - Shell Tables"
      title={plain(spec.title)}
      subtitle="Every table the study will report, with the cells empty. The columns and the row order are what the filled tables will carry, so nothing is left to decide once the data arrive."
    >
      {BLOCK_ORDER.map((block) => {
        const inBlock = ordered.filter((t) => t.block === block);
        if (!inBlock.length) return null;

        return (
          <section key={block} className="mb-10">
            <h2 className="eyebrow mb-4">{BLOCK_HEADING[block]}</h2>
            {block === "exploratory" && (
              <Note>
                Exploratory analyses are hypothesis-generating. They are not powered and must not
                be reported as confirmatory findings.
              </Note>
            )}
            {inBlock.map((table) => (
              <ShellTableBlock
                key={table.number}
                table={table}
                labelOf={labelOf}
                flagged={flagged.has(table.number)}
              />
            ))}
          </section>
        );
      })}
    </DocumentShell>
  );
}

function ShellTableBlock({
  table,
  labelOf,
  flagged,
}: {
  table: ShellTable;
  labelOf: (id: string, fallback: string) => string;
  flagged: boolean;
}) {
  const width = (table.columns ?? []).length;
  const tier = TIER[table.block];

  return (
    <div id={`table-${table.number}`} className="mb-10 scroll-mt-5">
      <div className="mb-1 flex flex-wrap items-baseline gap-2">
        <span
          className={`rounded-sm px-1.5 py-0.5 text-2xs font-bold tracking-wider uppercase ${tier.className}`}
        >
          {tier.label}
        </span>
        {flagged && (
          <span className="inline-flex items-center gap-1 text-2xs font-semibold text-warn">
            <AlertTriangleIcon size={12} />
            Flagged in review
          </span>
        )}
      </div>

      <h3 className="text-base font-bold tracking-tight text-ink">
        Table {table.number}. {line(table.title)}
      </h3>

      <div className="mt-3">
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
                  <Td key={c} centre placeholder>
                    __
                  </Td>
                ))}
              </tr>
            );
          })}
        </DocTable>
      </div>

      {table.test_applied && (
        <p className="mt-2 text-xs text-ink-3">
          <span className="font-semibold text-ink-2">Test applied:</span>{" "}
          {plain(table.test_applied)}
        </p>
      )}
      {table.footnote && <Note>{plain(table.footnote)}</Note>}
    </div>
  );
}
