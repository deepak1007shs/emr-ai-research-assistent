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
import { slotTitle } from "../tables/slots.ts";
import { contents, coverage, describe, rowLabels } from "../tables/describe.ts";

/**
 * The table plan: every table the study will report, and what belongs in each.
 *
 * It draws them as empty grids, which it did once before and stopped: one
 * baseline table ran to 28 rows labelled "", "Mean +/- SD", "", "Median (IQR)",
 * readable only by resolving ids the reader could not see. The prose that
 * replaced it fixed that by folding a sub-row into the row above, and the grid
 * is drawn from the same folding now, so a row reads "Age (mean +/- SD)"
 * whether it is a name in a sentence or the first cell of a table.
 *
 * A grid still says nothing about what goes in it, so what the axes could not
 * carry stays underneath: the test that fills it, the statistic in each cell,
 * and what is done where a value is missing. A shell table is a table a
 * supervisor signs and a student later fills in, and it has to be a table.
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

function describeTable(
  table: ShellTable,
  labelOf: (id: string, fallback: string) => string,
  columnOf: (id: string) => string | undefined,
): Block[] {
  const blocks: Block[] = [];

  // The slot above the number. A reader cites "Table 7"; the slot tells them
  // which part of the skeleton they are in, and lets a missing part be seen.
  const slot = slotTitle(table.slot);
  if (slot) blocks.push(h(`${table.slot} - ${slot}`, HeadingLevel.HEADING_2));
  blocks.push(
    h(`Table ${table.number}: ${table.title}`, slot ? HeadingLevel.HEADING_3 : HeadingLevel.HEADING_2),
  );

  // The grid. Its columns are the axes the two "Rows (X)" and "Columns (Y)"
  // lines used to describe, so those lines are gone: the table is the
  // description now, and a supervisor signs a page shaped like the one the
  // thesis will carry.
  blocks.push(shellGrid(table, rowLabels(table, labelOf, columnOf)));

  // What a grid cannot hold. The test is always said, as the house blueprint
  // says it; the other two only where the plan set them.
  const said = describe(table, labelOf, columnOf);
  if (said.analysis) blocks.push(footnote("Footnote: test used", said.analysis, " = "));
  if (said.reported) blocks.push(footnote("Cell shows", said.reported));
  if (said.missing) blocks.push(footnote("If data are missing", said.missing));

  // Spacing before the next table, which the heading's own spacing does not
  // give when two tables sit under one slot heading.
  blocks.push(new Paragraph({ text: "", spacing: { after: 120 } }));
  return blocks;
}

export async function buildTablesDocx(spec: ShellTablesSpec): Promise<Buffer> {
  const doc: Block[] = [];
  // Row wording comes from the plan's registry, resolved by id, so a table and
  // the form it will be filled from cannot name the same variable differently.
  // An unresolved id falls back to the wording the row carries, so a table
  // never prints "var_sex" where a variable name belongs.
  const labelOf = (id: string, fallback: string) => spec.labels?.[id] ?? fallback ?? id;
  const columnOf = (id: string) => spec.columns?.[id];

  doc.push(
    new Paragraph({
      text: "ANALYSIS BLUEPRINT",
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
      "Table plan derived from the reviewed protocol and the approved Statistical Analysis Plan.",
    ),
  );

  doc.push(h("How to read this document", HeadingLevel.HEADING_1));
  doc.push(
    new Paragraph({
      text: line(
        "This document is not the results chapter. It is the plan for the results chapter. It lists every table that will appear, in order, and for each one it states what runs down the left side, what runs across the top, the statistic inside each cell, the test or model applied, and what will be done where a value is not available. Fixing the last of those in advance is what makes the handling of missing values a planning decision rather than a reaction to the results.",
      ),
      spacing: { after: 160 },
    }),
  );
  doc.push(
    new Paragraph({
      text: line(
        "Once this is signed, the table list, the variables in each table, the tests and the missing-data rules are fixed. Any change made after the data have been examined is a protocol deviation, and is recorded as one.",
      ),
      spacing: { after: 160 },
    }),
  );

  // The rules that hold for every table, printed once rather than repeated
  // under twenty of them, which is how a reader learns to skip what is under a
  // table.
  if (spec.rules?.length) {
    doc.push(h("Rules that apply to every table", HeadingLevel.HEADING_1));
    for (const rule of spec.rules) {
      doc.push(new Paragraph({ text: line(rule), bullet: { level: 0 }, spacing: { after: 60 } }));
    }
  }

  if (spec.missing_data) {
    doc.push(h("Missing data, fixed in advance", HeadingLevel.HEADING_1));
    doc.push(
      new Paragraph({ text: line(spec.missing_data), spacing: { after: 160 } }),
    );
    doc.push(
      italic(
        "A variable an objective requires but the form does not collect makes that objective unanswerable. That is raised before the analysis begins rather than answered with a substitute.",
      ),
    );
  }

  const list = contents(spec);
  doc.push(h(`Contents: ${list.length} table${list.length === 1 ? "" : "s"}`, HeadingLevel.HEADING_1));
  for (const entry of list) {
    doc.push(
      new Paragraph({
        children: [
          new TextRun({ text: `Table ${entry.number}.   `, bold: true }),
          new TextRun({ text: line(entry.title) }),
          ...(entry.slot ? [new TextRun({ text: `   [${entry.slot}]` })] : []),
        ],
        indent: { left: 1080, hanging: 1080 },
        spacing: { after: 40 },
      }),
    );
  }

  const ordered = [...spec.tables].sort((a, b) => a.number - b.number);

  for (const block of BLOCK_ORDER) {
    const inBlock = ordered.filter((t) => t.block === block);
    if (!inBlock.length) continue;

    doc.push(h(BLOCK_HEADING[block], HeadingLevel.HEADING_1));

    // Once, under the block they govern. A policy repeated beneath twenty
    // tables is how a reader learns to skip what is beneath a table.
    if ((block === "primary" || block === "secondary") && spec.multiplicity) {
      doc.push(italic(`Multiplicity: ${spec.multiplicity}`));
    }
    if ((block === "primary" || block === "secondary") && spec.missing_data) {
      doc.push(italic(`Missing data: ${spec.missing_data}`));
    }

    if (block === "exploratory") {
      doc.push(
        italic(
          "Exploratory analyses are hypothesis-generating. They are not powered and must not be reported as confirmatory findings.",
        ),
      );
    }
    for (const table of inBlock) doc.push(...describeTable(table, labelOf, columnOf));
  }

  // Both directions, before anyone signs it. A question the document never
  // answers and a table nobody asked for are the two failures that survive
  // every other check, because each table on its own looks correct.
  const objectiveIds = Object.keys(spec.labels ?? {}).filter((id) => /^[PSE]\d+$/.test(id));
  const { answered, unanswered, orphans } = coverage(spec, objectiveIds);
  if (answered.length || unanswered.length || orphans.length) {
    doc.push(h("Objective to table coverage check", HeadingLevel.HEADING_1));
    for (const row of answered) {
      doc.push(
        new Paragraph({
          text: line(
            `${row.id} - ${row.question}: Table ${row.tables.join(", Table ")}.`,
          ),
          spacing: { after: 60 },
        }),
      );
    }
    for (const row of unanswered) {
      doc.push(
        new Paragraph({
          text: line(
            `${row.id} - ${row.question}: NO TABLE. This objective is unanswerable as the document stands, and must be given a table or declared unanswerable with the present data.`,
          ),
          spacing: { after: 60 },
        }),
      );
    }
    for (const row of orphans) {
      doc.push(
        new Paragraph({
          text: line(
            `Table ${row.number} (${row.title}) answers no objective, and is to be deleted unless one is named for it.`,
          ),
          spacing: { after: 60 },
        }),
      );
    }
    if (!unanswered.length && !orphans.length) {
      doc.push(
        italic(
          "No table in this document is without an objective, and no objective in the plan is without a table.",
        ),
      );
    }
  }

  return Packer.toBuffer(new Document({ styles: HOUSE_STYLES, sections: [{ children: doc }] }));
}
