import {
  HeadingLevel,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import { HOUSE_BORDER, plain } from "./house-style.ts";
import {
  BLOCK_HEADING,
  BLOCK_NOTE_LABEL,
  BLOCK_ORDER,
  blockNote,
} from "../tables/block-notes.ts";
import { describe, rowLabels } from "../tables/describe.ts";
import type { SapSpec } from "../sap/types.ts";
import type { ShellTable, ShellTablesSpec } from "../tables/types.ts";

/**
 * The shell tables, drawn.
 *
 * One definition, because there used to be a document whose whole purpose was
 * to hold these and a section of the analysis plan whose whole content was a
 * sentence saying where that document was. They are printed in the plan now,
 * under the heading that used to point away from it, and this is what prints
 * them. Two renderers drawing the same table from the same spec is the drift
 * this exists to end.
 *
 * A grid says nothing about what belongs in it, so what the axes cannot carry
 * stays underneath: the test that fills it, in the house blueprint's own words
 * and in the one footnote line the blueprint allows.
 */

type Block = Paragraph | Table;

const line = (v?: string) => plain(String(v ?? "").replace(/\s*\n\s*/g, " "));


function heading(text: string, level: (typeof HeadingLevel)[keyof typeof HeadingLevel]) {
  return new Paragraph({ text: line(text), heading: level, spacing: { before: 280, after: 140 } });
}

/** One cell of a shell table: bordered, and empty unless it is a label. */
function shellCell(text: string, bold: boolean) {
  return new TableCell({
    children: [new Paragraph({ children: [new TextRun({ text: line(text), bold })] })],
    margins: { top: 60, bottom: 60, left: 100, right: 100 },
    borders: { top: HOUSE_BORDER, bottom: HOUSE_BORDER, left: HOUSE_BORDER, right: HOUSE_BORDER },
  });
}

/**
 * The empty grid: the plan's columns across the top, its folded rows down the
 * side, and nothing in between. The blank cells are the point.
 */
function shellGrid(table: ShellTable, names: string[]): Table {
  const columns = table.columns.length ? table.columns : ["Variable"];
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        tableHeader: true,
        children: columns.map((column) => shellCell(column, true)),
      }),
      ...names.map(
        (name) =>
          new TableRow({
            children: [
              shellCell(name, false),
              ...columns.slice(1).map(() => shellCell("", false)),
            ],
          }),
      ),
    ],
  });
}

/** A line under a grid, "Footnote: test used = ..." as the house blueprint writes it. */
function footnote(label: string, value: string, separator = ": ") {
  return new Paragraph({
    children: [
      new TextRun({ text: `${label}${separator}`, bold: true }),
      new TextRun({ text: line(value) }),
    ],
    spacing: { after: 80 },
  });
}

/**
 * One table, in the three parts the house blueprint fixes: the numbered title
 * line, the empty grid, and the one footnote naming the test.
 *
 * The slot code above the number, the statistic per cell and the per-table
 * missing-data rule used to print here as well. The blueprint carries one
 * footnote and no slot codes, and what those three lines said is said once at
 * the family level instead: the slot in the plan's own numbering, the statistic
 * in the column headings, and the missing-data rule in the population line.
 */
function oneTable(
  table: ShellTable,
  labelOf: (id: string, fallback: string) => string,
  columnOf: (id: string) => string | undefined,
): Block[] {
  const blocks: Block[] = [];

  // Built from two runs, because the blueprint puts two spaces after the stop
  // and the house sanitiser collapses runs of spaces in model-written prose.
  // The number is ours and the title is the model's; only the title needs it.
  blocks.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_4,
      spacing: { before: 280, after: 140 },
      children: [
        new TextRun({ text: `Table ${table.number}.  ` }),
        new TextRun({ text: line(table.title) }),
      ],
    }),
  );

  // Said once at the top where the whole table is dead, rather than leaving the
  // reader to work it out from four rows that each say the same thing.
  if (table.unavailable) blocks.push(footnote("No data", table.unavailable));

  blocks.push(shellGrid(table, rowLabels(table, labelOf, columnOf)));

  const said = describe(table, labelOf, columnOf);
  if (said.analysis) blocks.push(footnote("Footnote: test used", said.analysis, " = "));

  blocks.push(new Paragraph({ text: "", spacing: { after: 120 } }));
  return blocks;
}

/**
 * Section 6 of the analysis plan: four family headings, each with its note line
 * and its tables, in the order the blueprint fixes.
 *
 * There used to be a contents list above them and a slot code beside every
 * title. Both were navigation for a document that was once separate; printed
 * inside the plan they duplicate its own numbering, and the blueprint carries
 * neither.
 */
export function shellTableSection(spec: ShellTablesSpec, sap?: SapSpec): Block[] {
  const labelOf = (id: string, fallback = "") => spec.labels?.[id] ?? fallback ?? id;
  const columnOf = (id: string) => spec.columns?.[id];
  const blocks: Block[] = [];

  for (const block of BLOCK_ORDER) {
    const tables = spec.tables.filter((t) => t.block === block);
    if (!tables.length) continue;
    blocks.push(heading(BLOCK_HEADING[block], HeadingLevel.HEADING_2));

    // One line under the family heading and nowhere else: who is analysed for
    // the primary, what a secondary result may claim, the caveat over anything
    // exploratory, and the multiplicity rule that governs the family.
    const note = blockNote(block, spec, sap);
    const label = BLOCK_NOTE_LABEL[block];
    if (note) {
      blocks.push(
        label
          ? footnote(label, note)
          : new Paragraph({ text: line(note), spacing: { after: 80 } }),
      );
    }

    for (const table of tables) blocks.push(...oneTable(table, labelOf, columnOf));
  }

  return blocks;
}
