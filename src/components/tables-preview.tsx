import type { ShellTable, ShellTablesSpec } from "@/lib/tables/types";
import { line, plain } from "@/lib/render/plain";
import { BLOCK_HEADING, BLOCK_ORDER } from "@/lib/tables/block-notes";
import { describe, rowLabels } from "@/lib/tables/describe";
import { AlertTriangleIcon } from "./icons";
import { DocTable } from "./document-shell";

/**
 * Section 6 of the analysis plan, on screen.
 *
 * Mirrors render/shell-tables.ts: the four family headings in order, each with
 * its note line and its tables. There is no separate tables document any more
 * and no page of its own; this is embedded in the plan's preview, so a reader
 * who checks the screen and then downloads the plan finds the same tables.
 *
 * Each table carries an anchor, so a finding in the review rail can send you to
 * the table it is about.
 */


/**
 * Section 6 of the analysis plan, on screen.
 *
 * The tables are part of the plan and have no document of their own, so this is
 * embedded in the plan's own preview rather than wrapped in a shell. It draws
 * what `render/shell-tables.ts` draws, because a reader who checks the screen
 * and then downloads the plan must not find two different sets of tables.
 */
export function ShellTableSection({
  spec,
  /** Table numbers a finding flagged, so the reader shows what the rail says. */
  flagged = new Set<number>(),
}: {
  spec: ShellTablesSpec;
  flagged?: Set<number>;
}) {
  const labelOf = (id: string, fallback: string) => spec.labels?.[id] ?? fallback ?? id;
  const columnOf = (id: string) => spec.columns?.[id];
  const ordered = [...(spec.tables ?? [])].sort((a, b) => a.number - b.number);

  return (
    <>
      {BLOCK_ORDER.map((block) => {
        const inBlock = ordered.filter((t) => t.block === block);
        if (!inBlock.length) return null;

        return (
          <section key={block} className="mb-10">
            <h2 className="mb-4 text-base font-bold text-ink">{BLOCK_HEADING[block]}</h2>

            {/* No line under the family heading: the house documents go from
                the lettered heading straight to "Table N.". */}
            {inBlock.map((table) => (
              <ShellTableBlock
                key={table.number}
                table={table}
                labelOf={labelOf}
                columnOf={columnOf}
                flagged={flagged.has(table.number)}
              />
            ))}
          </section>
        );
      })}
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mt-1.5 flex gap-3 text-sm">
      <dt className="w-36 shrink-0 font-semibold text-ink">{label}</dt>
      <dd className="min-w-0 text-ink">{children}</dd>
    </div>
  );
}

function ShellTableBlock({
  table,
  labelOf,
  columnOf,
  flagged,
}: {
  table: ShellTable;
  labelOf: (id: string, fallback: string) => string;
  columnOf: (id: string) => string | undefined;
  flagged: boolean;
}) {
  const said = describe(table, labelOf, columnOf);

  return (
    <div id={`table-${table.number}`} className="mb-8 scroll-mt-5">
      {/* Review chrome, not part of the document: it marks a table the rail
          has something to say about, and does not print. */}
      {flagged && (
        <p className="no-print mb-1 inline-flex items-center gap-1 text-2xs font-semibold text-warn">
          <AlertTriangleIcon size={12} />
          Flagged in review
        </p>
      )}

      <h4 className="text-base font-bold text-ink">
        Table {table.number}.  {line(table.title)}
      </h4>

      {/* The grid, as the download draws it: the plan's columns across the top,
          its folded rows down the side, and every cell blank. */}
      <div className="mt-2">
        <DocTable headers={table.columns.length ? table.columns : ["Variable"]}>
          {rowLabels(table, labelOf, columnOf).map((name, i) => (
            <tr key={i}>
              <td className="border border-ink px-2.5 py-1.5 align-top text-sm">{name}</td>
              {(table.columns.length ? table.columns : ["Variable"]).slice(1).map((_, c) => (
                <td key={c} className="border border-ink px-2.5 py-1.5" />
              ))}
            </tr>
          ))}
        </DocTable>
      </div>

      <dl className="mt-2">
        {said.analysis && <Field label="Footnote: test used =">{plain(said.analysis)}</Field>}
      </dl>
    </div>
  );
}
