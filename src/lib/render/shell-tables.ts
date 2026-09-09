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
import { slotTitle } from "../tables/slots.ts";
import { contents, describe, rowLabels } from "../tables/describe.ts";
import type { ShellTable, ShellTablesSpec, TableBlock } from "../tables/types.ts";

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
 * stays underneath: the test that fills it, in the house blueprint's own
 * words, and the statistic per cell and the missing-data rule where the plan
 * sets them.
 */

type Block = Paragraph | Table;

const line = (v?: string) => plain(String(v ?? "").replace(/\s*\n\s*/g, " "));

const BLOCK_HEADING: Record<TableBlock, string> = {
  descriptive: "Descriptive and baseline characteristics",
  primary: "Primary outcome",
  secondary: "Secondary outcomes",
  exploratory: "Exploratory analyses",
};

const BLOCK_ORDER: TableBlock[] = ["descriptive", "primary", "secondary", "exploratory"];

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

function oneTable(
  table: ShellTable,
  labelOf: (id: string, fallback: string) => string,
  columnOf: (id: string) => string | undefined,
): Block[] {
  const blocks: Block[] = [];

  // The slot above the number. A reader cites "Table 7"; the slot tells them
  // which part of the skeleton they are in, and lets a missing part be seen.
  const slot = slotTitle(table.slot);
  if (slot) blocks.push(heading(`${table.slot} - ${slot}`, HeadingLevel.HEADING_3));
  blocks.push(heading(`Table ${table.number}: ${table.title}`, HeadingLevel.HEADING_4));

  // Said once at the top where the whole table is dead, rather than leaving the
  // reader to work it out from four rows that each say the same thing.
  if (table.unavailable) blocks.push(footnote("No data", table.unavailable));

  blocks.push(shellGrid(table, rowLabels(table, labelOf, columnOf)));

  const said = describe(table, labelOf, columnOf);
  if (said.analysis) blocks.push(footnote("Footnote: test used", said.analysis, " = "));
  if (said.reported) blocks.push(footnote("Cell shows", said.reported));
  if (said.missing) blocks.push(footnote("If data are missing", said.missing));

  blocks.push(new Paragraph({ text: "", spacing: { after: 120 } }));
  return blocks;
}

/**
 * Section 6 of the analysis plan: the contents list, then the tables.
 *
 * The plan's own missing-data rule and its objective-to-table map are not
 * repeated here. Section 4 fixes the first and Section 3 carries the second,
 * and a second statement of either is a second thing that can disagree.
 */
export function shellTableSection(spec: ShellTablesSpec): Block[] {
  const labelOf = (id: string, fallback = "") => spec.labels?.[id] ?? fallback ?? id;
  const columnOf = (id: string) => spec.columns?.[id];
  const blocks: Block[] = [];

  const list = contents(spec);
  blocks.push(
    new Paragraph({
      children: [
        new TextRun({ text: `Contents: ${spec.tables.length} tables`, bold: true }),
      ],
      spacing: { before: 120, after: 120 },
    }),
  );
  for (const entry of list) {
    blocks.push(
      new Paragraph({
        children: [
          new TextRun({ text: `Table ${entry.number}.   ` }),
          new TextRun({ text: line(entry.title) }),
          ...(entry.slot ? [new TextRun({ text: `   [${entry.slot}]` })] : []),
        ],
        spacing: { after: 40 },
      }),
    );
  }

  for (const block of BLOCK_ORDER) {
    const tables = spec.tables.filter((t) => t.block === block);
    if (!tables.length) continue;
    blocks.push(heading(BLOCK_HEADING[block], HeadingLevel.HEADING_2));

    // Above the primary block and nowhere else. Who is analysed and on what
    // denominator is what a reader needs before the first result, and the plan
    // states it in Section 4, thirty pages behind them.
    if (block === "primary" && spec.analysis_population) {
      blocks.push(footnote("Analysis population", spec.analysis_population));
    }

    for (const table of tables) blocks.push(...oneTable(table, labelOf, columnOf));
  }

  return blocks;
}
