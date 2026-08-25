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
import { HOUSE_BORDER, HOUSE_STYLES, plain } from "./house-style";
import { chooseTest, degreesOfFreedomNote } from "../sap/choose-test.ts";
import type { SapSpec } from "../sap/types.ts";

/**
 * The Statistical Analysis Plan: two sections.
 *
 * Objectives as answerable questions, then the analysis map that links each one
 * to its test and to the table it will fill. Everything passes through plain(),
 * so no em dash or smart quote can reach the page.
 */

type Block = Paragraph | Table;

const line = (v?: string) => plain(String(v ?? "").replace(/\s*\n\s*/g, " "));

function heading(text: string, level: (typeof HeadingLevel)[keyof typeof HeadingLevel]) {
  return new Paragraph({ text: line(text), heading: level, spacing: { before: 280, after: 140 } });
}

function para(text: string) {
  return new Paragraph({ text: plain(text), spacing: { after: 140 } });
}

function italic(text: string) {
  return new Paragraph({
    children: [new TextRun({ text: plain(text), italics: true })],
    spacing: { after: 140 },
  });
}

/** "P1: question" with the label in bold, as a bullet. */
function objectiveBullet(id: string, question: string) {
  return new Paragraph({
    bullet: { level: 0 },
    spacing: { after: 100 },
    children: [
      new TextRun({ text: `${line(id)}: `, bold: true }),
      new TextRun({ text: plain(question) }),
    ],
  });
}

function cell(text: string, bold = false) {
  return new TableCell({
    children: [new Paragraph({ children: [new TextRun({ text: line(text), bold })] })],
    margins: { top: 70, bottom: 70, left: 110, right: 110 },
    borders: { top: HOUSE_BORDER, bottom: HOUSE_BORDER, left: HOUSE_BORDER, right: HOUSE_BORDER },
  });
}

const HEADERS = ["Objective", "Outcome", "Predictor(s)", "Data type", "Statistical test -> Table #"];

export async function buildSapDocx(spec: SapSpec): Promise<Buffer> {
  const doc: Block[] = [];

  doc.push(
    new Paragraph({
      text: "STATISTICAL ANALYSIS PLAN",
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
      spacing: { after: 160 },
    }),
  );
  doc.push(
    new Paragraph({
      children: [new TextRun({ text: plain(spec.title), bold: true })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 280 },
    }),
  );

  // ---- Section 1
  doc.push(heading("Section 1 - Objectives as Answerable Questions", HeadingLevel.HEADING_1));

  doc.push(heading("Aim", HeadingLevel.HEADING_2));
  doc.push(para(spec.aim));

  const primary = spec.objectives.filter((o) => o.tier === "primary");
  const secondary = spec.objectives.filter((o) => o.tier === "secondary");

  doc.push(heading("Primary objective(s)", HeadingLevel.HEADING_2));
  for (const o of primary) doc.push(objectiveBullet(o.id, o.question));

  if (secondary.length) {
    doc.push(heading("Secondary objectives", HeadingLevel.HEADING_2));
    for (const o of secondary) doc.push(objectiveBullet(o.id, o.question));
  }

  // ---- Section 2
  doc.push(heading("Section 2 - Analysis Map", HeadingLevel.HEADING_1));
  doc.push(
    italic(
      "One row per objective. Every question is linked to its test AND to the empty results table it will fill.",
    ),
  );

  const reasons = new Map<string, string>();
  const rows = spec.analyses.map((row) => {
    const chosen = chooseTest(row);
    if (chosen) reasons.set(chosen.test, chosen.why);
    const test = chosen
      ? `${chosen.test} -> ${row.table_ref}`
      : `NO RULE COVERS THIS ROW. Decide the test and record it. -> ${row.table_ref}`;
    return [row.label, row.outcome, row.predictors, row.data_type, test];
  });

  doc.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({ tableHeader: true, children: HEADERS.map((h) => cell(h, true)) }),
        ...rows.map((r) => new TableRow({ children: r.map((v, i) => cell(v, i === 0)) })),
      ],
    }),
  );

  // ---- the notes under the map
  if (reasons.size) {
    doc.push(
      new Paragraph({
        spacing: { before: 200, after: 100 },
        children: [new TextRun({ text: "Why each test.", bold: true })],
      }),
    );
    for (const [test, why] of reasons) doc.push(para(`${test}: ${why}.`));
  }

  const adjusted = spec.analyses.find((a) => a.comparison === "adjusted");
  if (spec.expected_events !== undefined && adjusted) {
    const predictorCount = adjusted.predictors.split(",").filter((p) => p.trim()).length;
    const { note } = degreesOfFreedomNote(spec.expected_events, predictorCount);
    doc.push(
      new Paragraph({
        spacing: { before: 160, after: 100 },
        children: [new TextRun({ text: "Degrees of freedom.", bold: true })],
      }),
    );
    doc.push(para(note));
  }

  const excluded = spec.variables.filter(
    (v) => (v.role === "mediator" || v.role === "collider") && v.exclusion_reason,
  );
  if (excluded.length) {
    doc.push(
      new Paragraph({
        spacing: { before: 160, after: 100 },
        children: [new TextRun({ text: "Not adjusted for.", bold: true })],
      }),
    );
    for (const v of excluded) {
      doc.push(para(`${v.name} is a ${v.role}. ${v.exclusion_reason}`));
    }
    doc.push(para("Neither enters any model."));
  }

  doc.push(
    italic(
      "Generated from the study specification. Do not edit this document: change the specification and rebuild, or the analysis plan, the case record form and the shell tables will disagree.",
    ),
  );

  return Packer.toBuffer(new Document({ styles: HOUSE_STYLES, sections: [{ children: doc }] }));
}
