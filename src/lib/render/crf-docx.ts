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
import type { CrfField, CrfSpec } from "../crf/types.ts";
import { responseFor } from "../crf/response.ts";

/**
 * The case report form, and the data-collection plan it was expanded from.
 *
 * The plan comes first because it is what a guide checks in thirty seconds: a
 * tick means collect it here, an empty cell means do not, and that is what
 * guards against both missing data and over-collection.
 */

type Block = Paragraph | Table;

const line = (v?: string) => plain(String(v ?? "").replace(/\s*\n\s*/g, " "));
const TICK = "✓";

function h(text: string, level: (typeof HeadingLevel)[keyof typeof HeadingLevel]) {
  return new Paragraph({ text: line(text), heading: level, spacing: { before: 260, after: 130 } });
}

function para(text: string) {
  return new Paragraph({ text: plain(text), spacing: { after: 130 } });
}

function italic(text: string) {
  return new Paragraph({
    children: [new TextRun({ text: plain(text), italics: true })],
    spacing: { after: 130 },
  });
}

function cell(text: string, bold = false, centre = false) {
  return new TableCell({
    children: [
      new Paragraph({
        alignment: centre ? AlignmentType.CENTER : AlignmentType.LEFT,
        children: [new TextRun({ text: line(text), bold })],
      }),
    ],
    margins: { top: 60, bottom: 60, left: 100, right: 100 },
    borders: { top: HOUSE_BORDER, bottom: HOUSE_BORDER, left: HOUSE_BORDER, right: HOUSE_BORDER },
  });
}

function table(headers: string[], rows: string[][], options: { centreFrom?: number } = {}) {
  const centreFrom = options.centreFrom ?? Number.POSITIVE_INFINITY;
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        tableHeader: true,
        children: headers.map((head, i) => cell(head, true, i >= centreFrom)),
      }),
      ...rows.map(
        (row) =>
          new TableRow({
            children: row.map((v, i) => cell(v, false, i >= centreFrom)),
          }),
      ),
    ],
  });
}


export async function buildCrfDocx(spec: CrfSpec): Promise<Buffer> {
  // Every wording comes from the plan's registry, resolved by id. The form
  // cannot call a variable something the plan does not call it.
  // An id the registry cannot resolve falls back to the wording carried here,
  // so a plan that has moved on since the form was built degrades to the old
  // wording rather than printing "var_age" on a form a patient is seen with.
  const labelOf = (id: string, fallback = "") => spec.labels?.[id] ?? fallback ?? id;
  const nameOf = (f: CrfField) => (f.variable_id ? labelOf(f.variable_id, f.label) : f.label);
  const fieldLabels = new Map<string, string>();
  for (const f of [...spec.identifiers, ...spec.sections.flatMap((s) => s.fields)]) {
    if (f.variable_id) fieldLabels.set(f.variable_id, f.label);
  }
  const doc: Block[] = [];

  /* ---- the data-collection plan ------------------------------------ */

  doc.push(
    new Paragraph({
      text: "DATA COLLECTION PLAN",
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
      spacing: { after: 160 },
    }),
  );
  doc.push(
    italic(
      "Rows are data elements, columns are the visits. A tick means collect it here; an empty cell means do not.",
    ),
  );
  doc.push(para(spec.capture_pattern));

  doc.push(
    table(
      ["DATA ELEMENT", ...spec.visits],
      spec.data_elements.map((e) => [
        e.element,
        ...spec.visits.map((v) => (e.visits.includes(v) ? TICK : "")),
      ]),
      { centreFrom: 1 },
    ),
  );

  doc.push(h("Exposure, outcome and confounder roll-call", HeadingLevel.HEADING_2));
  doc.push(
    italic("A build-time check. It stops the study's own variables going missing."),
  );
  doc.push(
    table(
      ["Role", "Variable", "Field", "Where captured"],
      spec.roll_call.map((r) => [
        r.role.replace(/_/g, " "),
        labelOf(r.ref_id, fieldLabels.get(r.ref_id) ?? r.ref_id),
        r.field_variable_id ? labelOf(r.field_variable_id, fieldLabels.get(r.field_variable_id) ?? r.field_variable_id) : "NOT CAPTURED",
        r.where,
      ]),
    ),
  );

  doc.push(h("Collected once, collected repeatedly", HeadingLevel.HEADING_2));
  doc.push(para(`Once: ${spec.collected_once.join("; ")}.`));
  doc.push(para(`Repeatedly: ${spec.collected_repeatedly.join("; ")}.`));

  /* ---- the form ----------------------------------------------------- */

  doc.push(
    new Paragraph({
      text: "CASE REPORT FORM (CRF)",
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
      pageBreakBefore: true,
      spacing: { after: 140 },
    }),
  );
  doc.push(
    new Paragraph({
      children: [new TextRun({ text: plain(spec.title), bold: true })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 100 },
    }),
  );
  doc.push(
    new Paragraph({
      children: [new TextRun({ text: plain(spec.institution), italics: true })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 260 },
    }),
  );

  const fieldRows = (fields: CrfField[]) =>
    fields.map((f, i) => [
      String(i + 1),
      f.primary_outcome ? `${nameOf(f)} (primary outcome)` : nameOf(f),
      f.type,
      responseFor(f),
    ]);

  doc.push(h("Form & Subject Identifiers", HeadingLevel.HEADING_2));
  doc.push(table(["#", "Field / Variable", "Field type", "Response"], fieldRows(spec.identifiers)));

  for (const section of spec.sections) {
    doc.push(h(`Section ${section.letter} - ${section.title}`, HeadingLevel.HEADING_2));
    doc.push(table(["#", "Field / Variable", "Field type", "Response"], fieldRows(section.fields)));
    if (section.note) doc.push(italic(section.note));
  }

  /* ---- what the form deliberately does not collect ------------------ */

  if (spec.derived.length) {
    doc.push(h("Values calculated from this form, not collected on it", HeadingLevel.HEADING_2));
    doc.push(
      table(
        ["Value", "Calculated from", "How"],
        spec.derived.map((d) => [
          d.variable_id ? labelOf(d.variable_id, d.name) : d.name,
          d.from_variable_ids
            .map((id) => labelOf(id, fieldLabels.get(id) ?? id))
            .join("; "),
          d.how,
        ]),
      ),
    );
    doc.push(
      italic(
        "Do not record these here. A computed value entered by hand cannot be audited, and the raw data is what lets an error be corrected later.",
      ),
    );
  }

  return Packer.toBuffer(new Document({ styles: HOUSE_STYLES, sections: [{ children: doc }] }));
}

/** Re-exported so the renderer stays the one import a caller needs. */
export { responseFor };
