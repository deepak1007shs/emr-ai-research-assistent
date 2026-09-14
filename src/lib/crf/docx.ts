import {
  AlignmentType,
  Document,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import { HOUSE_BORDER, HOUSE_FONT, HOUSE_STYLES } from "../render/house-style.ts";
import { spaced } from "../render/plain.ts";
import { labelFor, responseFor } from "./response.ts";
import type { CrfForm } from "./build.ts";

/**
 * The form as a Word file, in the reference form's own measurements.
 *
 * This is the one document in the application that overrides the house style on
 * purpose. Everywhere else is 12pt with headings distinguished by weight alone,
 * because "12pt" is a blanket instruction; a form is a measured layout, and the
 * spec's instruction is to match `CRF_FORMAT_REFERENCE.docx`. The sizes below
 * were read from that file: title 15pt bold centred, the study title 10.5pt
 * centred, section headings 12pt bold, table text 9pt, and four columns at
 * roughly 5, 33, 15 and 47 per cent of the text width.
 *
 * Sizes are set on each run rather than by a heading style, which costs the
 * document its navigation pane and is what the deleted renderer did for the
 * same reason: a heading at 12pt is not a Word heading, it is a bold line.
 *
 * The file is not compared byte for byte anywhere. `Packer` writes a zip, and a
 * zip carries the time it was written; `markdown.ts` is the artefact the
 * acceptance test pins, and every string here comes from the stored form.
 */

/** Half-points, as docx measures size. */
const TITLE = 30;
const SUBTITLE = 21;
const HEADING = 24;
const BODY = 18;

/** Twips. A4 is 11906 x 16838; the margins are the reference's 1.76 cm. */
const MARGIN = 998;
const TEXT_WIDTH = 11906 - MARGIN * 2;
const COLUMNS = [5, 33, 15, 47].map((share) => Math.round((TEXT_WIDTH * share) / 100));

const HEADINGS = ["S.No.", "Field / Variable", "Field type", "Response"];

/** The field types, as the form prints them. */
const PRINTED: Record<string, string> = {
  text: "Text",
  number: "Number",
  date: "Date",
  datetime: "Date and time",
  phone: "Phone number",
  single_select: "Single-select",
  multi_select: "Multi-select",
  single_select_text: "Single-select + text",
};

const run = (text: string, size: number, bold = false) =>
  new TextRun({ text: spaced(text), size, bold, font: HOUSE_FONT });

function line(text: string, size: number, bold = false, centre = false) {
  return new Paragraph({
    children: [run(text, size, bold)],
    alignment: centre ? AlignmentType.CENTER : AlignmentType.LEFT,
    spacing: { after: 120 },
  });
}

function cell(text: string, width: number, bold = false) {
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    margins: { top: 60, bottom: 60, left: 90, right: 90 },
    borders: {
      top: HOUSE_BORDER,
      bottom: HOUSE_BORDER,
      left: HOUSE_BORDER,
      right: HOUSE_BORDER,
    },
    // One paragraph per line, so the two readers of an agreement study sit on
    // their own lines inside the one answer cell.
    // A bold TODO, as the plan prints one, rather than the asterisks that mark
    // it in the markdown: a field the protocol left undefined says so on paper.
    children: spaced(text)
      .split("\n")
      .map(
        (part) =>
          new Paragraph({
            children: part
              .split(/(\*\*TODO:\*\*)/)
              .filter(Boolean)
              .map((piece) =>
                piece === "**TODO:**" ? run("TODO:", BODY, true) : run(piece, BODY, bold),
              ),
          }),
      ),
  });
}

export async function buildCrfDocx(form: CrfForm): Promise<Buffer> {
  const body: (Paragraph | Table)[] = [
    line("CASE RECORD FORM", TITLE, true, true),
    line(form.title, SUBTITLE, false, true),
  ];

  for (const section of form.sections) {
    body.push(line(`Section ${section.code} - ${section.title}`, HEADING, true));
    body.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        columnWidths: COLUMNS,
        rows: [
          new TableRow({
            tableHeader: true,
            children: HEADINGS.map((heading, i) => cell(heading, COLUMNS[i], true)),
          }),
          ...form.fields
            .filter((field) => field.section === section.code)
            .map(
              (field) =>
                new TableRow({
                  children: [
                    cell(String(field.sno), COLUMNS[0]),
                    cell(labelFor(field), COLUMNS[1]),
                    cell(PRINTED[field.type] ?? field.type, COLUMNS[2]),
                    cell(responseFor(field), COLUMNS[3]),
                  ],
                }),
            ),
        ],
      }),
    );
    // A table and the heading after it, with nothing between, read as one
    // block on the page.
    body.push(new Paragraph({ text: "", spacing: { after: 120 } }));
  }

  // The open items are not printed. The form is headings, tables and answer
  // spaces; a question waiting on the investigator is not something the person
  // holding the pen can do anything with. They are on the page and in the
  // markdown instead.

  const document = new Document({
    styles: HOUSE_STYLES,
    sections: [
      {
        properties: {
          page: {
            size: { width: 11906, height: 16838 },
            margin: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN },
          },
        },
        children: body,
      },
    ],
  });

  return Buffer.from(await Packer.toBuffer(document));
}
