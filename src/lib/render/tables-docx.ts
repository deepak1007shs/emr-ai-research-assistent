import {
  AlignmentType,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import { HOUSE_BORDER, HOUSE_STYLES, plain } from "./house-style.ts";
import type { ShellTable, ShellTablesSpec, TableBlock } from "../tables/types.ts";

/**
 * Draws every table the study will report, with the cells empty.
 *
 * A shell table is not a smaller results table; it is the same table before the
 * numbers exist. So the columns, the row order and the footnote are exactly what
 * the filled version will carry, and nothing is decided later.
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

function h(text: string, level: (typeof HeadingLevel)[keyof typeof HeadingLevel]) {
  return new Paragraph({ text: line(text), heading: level, spacing: { before: 280, after: 140 } });
}

function italic(text: string) {
  return new Paragraph({
    children: [new TextRun({ text: plain(text), italics: true })],
    spacing: { after: 160 },
  });
}

function cell(text: string, options: { bold?: boolean; centre?: boolean; span?: number } = {}) {
  return new TableCell({
    ...(options.span ? { columnSpan: options.span } : {}),
    children: [
      new Paragraph({
        alignment: options.centre ? AlignmentType.CENTER : AlignmentType.LEFT,
        children: [new TextRun({ text: line(text), bold: options.bold })],
      }),
    ],
    margins: { top: 60, bottom: 60, left: 100, right: 100 },
    borders: { top: HOUSE_BORDER, bottom: HOUSE_BORDER, left: HOUSE_BORDER, right: HOUSE_BORDER },
  });
}

function drawTable(table: ShellTable, labelOf: (id: string, fallback: string) => string): Block[] {
  const blocks: Block[] = [];
  blocks.push(h(`Table ${table.number}: ${table.title}`, HeadingLevel.HEADING_2));

  const width = table.columns.length;

  const rows = table.rows.map((row) => {
    const label = row.variable_id ? labelOf(row.variable_id, row.label) : row.label;
    if (row.heading) {
      // A variable heading spans the table; its categories carry the numbers.
      return new TableRow({ children: [cell(label, { bold: true, span: width })] });
    }
    return new TableRow({
      children: [
        cell(row.indent ? `    ${label}` : label),
        // Empty on purpose. This is a shell, not a result.
        ...Array.from({ length: width - 1 }, () => cell("", { centre: true })),
      ],
    });
  });

  blocks.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({
          tableHeader: true,
          children: table.columns.map((c, i) => cell(c, { bold: true, centre: i > 0 })),
        }),
        ...rows,
      ],
    }),
  );

  if (table.test_applied) blocks.push(italic(`Test applied: ${table.test_applied}`));
  if (table.footnote) blocks.push(italic(table.footnote));
  return blocks;
}

export async function buildTablesDocx(spec: ShellTablesSpec): Promise<Buffer> {
  const doc: Block[] = [];
  // Row wording comes from the plan's registry, resolved by id, so a table and
  // the form it will be filled from cannot name the same variable differently.
  // An unresolved id falls back to the wording the row carries, so a table
  // never prints "var_sex" where a variable name belongs.
  const labelOf = (id: string, fallback: string) => spec.labels?.[id] ?? fallback ?? id;

  doc.push(
    new Paragraph({
      text: "SHELL TABLES",
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
      spacing: { after: 140 },
    }),
  );
  doc.push(
    new Paragraph({
      children: [new TextRun({ text: plain(spec.title), bold: true })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 240 },
    }),
  );
  doc.push(
    italic(
      "Every table the study will report, with the cells empty. The columns and the row order are what the filled tables will carry, so nothing is left to decide once the data arrive.",
    ),
  );

  const ordered = [...spec.tables].sort((a, b) => a.number - b.number);

  for (const block of BLOCK_ORDER) {
    const inBlock = ordered.filter((t) => t.block === block);
    if (!inBlock.length) continue;

    doc.push(h(BLOCK_HEADING[block], HeadingLevel.HEADING_1));
    if (block === "exploratory") {
      doc.push(
        italic(
          "Exploratory analyses are hypothesis-generating. They are not powered and must not be reported as confirmatory findings.",
        ),
      );
    }
    for (const table of inBlock) doc.push(...drawTable(table, labelOf));
  }

  return Packer.toBuffer(new Document({ styles: HOUSE_STYLES, sections: [{ children: doc }] }));
}
