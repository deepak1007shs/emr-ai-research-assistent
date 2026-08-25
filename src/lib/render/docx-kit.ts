import {
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

/**
 * The shared building blocks for every generated document.
 *
 * One kit rather than four, so two renderers cannot format the same field
 * differently. Everything passes through `plain()`, so no renderer can emit an
 * em dash or a smart quote by accident.
 */

export type Block = Paragraph | Table;

export const text = (v?: string | number | null) =>
  plain(v === null || v === undefined ? "" : String(v));

export const line = (v?: string) => plain(String(v ?? "").replace(/\s*\n\s*/g, " "));

export function title(value: string): Paragraph {
  return new Paragraph({
    text: line(value),
    heading: HeadingLevel.TITLE,
    spacing: { after: 200 },
  });
}

export function h1(value: string): Paragraph {
  return new Paragraph({
    text: line(value),
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 280, after: 140 },
  });
}

export function h2(value: string): Paragraph {
  return new Paragraph({
    text: line(value),
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 220, after: 120 },
  });
}

export function para(value: string): Paragraph {
  return new Paragraph({ text: text(value), spacing: { after: 130 } });
}

export function italic(value: string): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text: text(value), italics: true })],
    spacing: { after: 130 },
  });
}

export function labelled(label: string, value: string): Paragraph {
  return new Paragraph({
    spacing: { after: 130 },
    children: [
      new TextRun({ text: `${line(label)} `, bold: true }),
      new TextRun({ text: text(value) }),
    ],
  });
}

export function bullet(value: string, level = 0): Paragraph {
  return new Paragraph({ text: line(value), bullet: { level }, spacing: { after: 70 } });
}

export function cell(value: string, bold = false): TableCell {
  return new TableCell({
    children: [new Paragraph({ children: [new TextRun({ text: line(value), bold })] })],
    margins: { top: 70, bottom: 70, left: 110, right: 110 },
    borders: { top: HOUSE_BORDER, bottom: HOUSE_BORDER, left: HOUSE_BORDER, right: HOUSE_BORDER },
  });
}

/**
 * A bordered table. Short rows are padded and long ones truncated, so a
 * malformed spec degrades instead of producing a broken document.
 */
export function table(
  headers: string[],
  rows: (readonly (string | number)[])[],
  options: { boldFirstColumn?: boolean } = {},
): Table {
  const n = headers.length;
  const bodyRows = rows.map((row) => {
    const cells = row.slice(0, n).map((v) => String(v ?? ""));
    while (cells.length < n) cells.push("");
    return new TableRow({
      children: cells.map((v, i) => cell(v, Boolean(options.boldFirstColumn) && i === 0)),
    });
  });

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({ tableHeader: true, children: headers.map((head) => cell(head, true)) }),
      ...bodyRows,
    ],
  });
}

/** Stamps the spec version, so a document without one is not evidence of anything. */
export function versionStamp(specVersion: string, documentName: string): Paragraph {
  return italic(
    `${documentName} generated from study specification version ${specVersion}. Do not edit this document: change the specification and rebuild, or the four documents will disagree.`,
  );
}

/**
 * Says whether anyone has checked this specification.
 *
 * A document is always produced on request, but an unchecked one must never
 * look checked: the gate proves the documents agree with each other, not that
 * the study is right, and only a person can say the latter.
 */
export function statusNotice(notice?: string): Paragraph[] {
  if (!notice) return [];
  return [
    new Paragraph({
      spacing: { after: 200 },
      children: [new TextRun({ text: plain(notice), bold: true })],
    }),
  ];
}

export async function toBuffer(blocks: Block[]): Promise<Buffer> {
  return Packer.toBuffer(new Document({ styles: HOUSE_STYLES, sections: [{ children: blocks }] }));
}
