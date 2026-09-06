import type { ShellTable, ShellTablesSpec, TableBlock } from "@/lib/tables/types";
import { line, plain } from "@/lib/render/plain";
import { slotTitle } from "@/lib/tables/slots";
import { contents, describe, rowLabels } from "@/lib/tables/describe";
import { AlertTriangleIcon } from "./icons";
import { DocTable, DocumentShell, Note } from "./document-shell";

/**
 * The table plan, on screen.
 *
 * Mirrors tables-docx.ts: the contents list, then the four blocks in order,
 * each table said in words rather than drawn. It used to draw the grids with
 * their cells empty, which said nothing about what belonged in them.
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

export function TablesPreview({
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
    <DocumentShell
      kind="Section 6 - Analysis Blueprint"
      title={plain(spec.title)}
      subtitle="Every table the study will report: what each one is called, what is on each axis, and what will be reported in it. Fixed before the data arrive, so nothing about the layout is decided once they have."
    >
      <Contents spec={spec} />
      {BLOCK_ORDER.map((block) => {
        const inBlock = ordered.filter((t) => t.block === block);
        if (!inBlock.length) return null;

        return (
          <section key={block} className="mb-10">
            <h2 className="mb-4 text-base font-bold text-ink">{BLOCK_HEADING[block]}</h2>

            {/* Once, under the block they govern: mirrors `tables-docx.ts`. */}
            {(block === "primary" || block === "secondary") && spec.multiplicity && (
              <Note>Multiplicity: {plain(spec.multiplicity)}</Note>
            )}
            {(block === "primary" || block === "secondary") && spec.missing_data && (
              <Note>Missing data: {plain(spec.missing_data)}</Note>
            )}

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
                columnOf={columnOf}
                flagged={flagged.has(table.number)}
              />
            ))}
          </section>
        );
      })}
    </DocumentShell>
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

/** "This study reports 14 tables", before any of them. */
function Contents({ spec }: { spec: ShellTablesSpec }) {
  const list = contents(spec);
  return (
    <section className="mb-10">
      <h2 className="mb-3 text-base font-bold text-ink">
        Contents: {list.length} table{list.length === 1 ? "" : "s"}
      </h2>
      <ol className="space-y-1 text-sm">
        {list.map((entry) => (
          <li key={entry.number}>
            <a href={`#table-${entry.number}`} className="hover:text-brand">
              <span className="font-semibold">Table {entry.number}.</span> {line(entry.title)}
              {entry.slot && <span className="text-muted"> [{entry.slot}]</span>}
            </a>
          </li>
        ))}
      </ol>
    </section>
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

      {slotTitle(table.slot) && (
        <h3 className="text-base font-bold text-ink">
          {table.slot} - {slotTitle(table.slot)}
        </h3>
      )}
      <h4 className={`font-bold text-ink ${slotTitle(table.slot) ? "mt-1 text-sm" : "text-base"}`}>
        Table {table.number}: {line(table.title)}
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
        {said.analysis && <Field label="Footnote: test used">{plain(said.analysis)}</Field>}
        {said.reported && <Field label="Cell shows">{line(said.reported)}</Field>}
        {said.missing && <Field label="If data are missing">{plain(said.missing)}</Field>}
      </dl>
    </div>
  );
}
