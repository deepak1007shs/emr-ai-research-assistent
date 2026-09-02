import {
  AlignmentType,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TextRun,
} from "docx";
import { HOUSE_STYLES, plain } from "./house-style.ts";
import type { ShellTable, ShellTablesSpec, TableBlock } from "../tables/types.ts";
import { slotTitle } from "../tables/slots.ts";
import { contents, coverage, describe } from "../tables/describe.ts";

/**
 * The table plan: every table the study will report, and what belongs in each.
 *
 * It used to draw the tables as empty grids. A grid says nothing about what is
 * meant to go in it, and this one said less than nothing: one baseline table
 * ran to 28 rows labelled "", "Mean +/- SD", "", "Median (IQR)", which is
 * readable only by resolving ids the reader cannot see. What a supervisor needs
 * before the data arrive is the list: how many tables there are, what each is
 * called, what is on each axis, and what will be reported in it.
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

/**
 * One labelled line of a table's specification.
 *
 * Hanging indent, so a column list that wraps stays under the columns rather
 * than under the label.
 */
function field(label: string, value: string) {
  return new Paragraph({
    children: [
      new TextRun({ text: `${label}   `, bold: true }),
      new TextRun({ text: line(value) }),
    ],
    indent: { left: 2160, hanging: 2160 },
    spacing: { after: 60 },
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

  // The five lines, with the house blueprint's labels and its naming of the
  // axes: it calls the rows X and the columns Y.
  const said = describe(table, labelOf, columnOf);
  blocks.push(field("Rows (X)", said.rows));
  blocks.push(field("Columns (Y)", said.columns));
  if (said.reported) blocks.push(field("Cell shows", said.reported));
  if (said.analysis) blocks.push(field("Test applied", said.analysis));
  if (said.missing) blocks.push(field("If data are missing", said.missing));

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
