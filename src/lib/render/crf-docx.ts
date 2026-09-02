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
import { columnsByVariable } from "../crf/columns.ts";

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
  // A response can carry a line per respondent, so a newline is a line and not
  // a space. Everything else has none and prints exactly as it did.
  const lines = String(text ?? "").split("\n");
  return new TableCell({
    children: lines.map(
      (part) =>
        new Paragraph({
          alignment: centre ? AlignmentType.CENTER : AlignmentType.LEFT,
          children: [new TextRun({ text: line(part), bold })],
        }),
    ),
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


/**
 * Which of the two documents is being rendered.
 *
 * `form` is what the data collector fills in, and nothing else. `plan` is the
 * evidence that the form is complete and collects nothing spare: the visit
 * grid, the roll-call and what is recorded once against what is recorded every
 * visit. They have different readers, which is why they are no longer one file.
 */
export type CrfVariant = "form" | "plan";

export async function buildCrfDocx(
  spec: CrfSpec,
  variant: CrfVariant = "form",
): Promise<Buffer> {
  // Every wording comes from the plan's registry, resolved by id. The form
  // cannot call a variable something the plan does not call it.
  // An id the registry cannot resolve falls back to the wording carried here,
  // so a plan that has moved on since the form was built degrades to the old
  // wording rather than printing "var_age" on a form a patient is seen with.
  const labelOf = (id: string, fallback = "") => spec.labels?.[id] ?? fallback ?? id;
  // Variable id to the column it becomes in the datasheet, from the form's own
  // fields, so the roll-call and the form cannot name it differently.
  const columns = columnsByVariable(spec);
  const nameOf = (f: CrfField) => (f.variable_id ? labelOf(f.variable_id, f.label) : f.label);
  const fieldLabels = new Map<string, string>();
  const everyField = [
    ...spec.identifiers,
    ...spec.sections.flatMap((s) => [...s.fields, ...(s.sections ?? []).flatMap((p) => p.fields)]),
  ];
  for (const f of everyField) {
    if (f.variable_id) fieldLabels.set(f.variable_id, f.label);
  }
  const doc: Block[] = [];

  /* ---- the data-collection plan ------------------------------------ */

  // Evidence for the supervisor and the committee, not instructions for the
  // person filling in the form. It used to sit on the front of the form, and a
  // nurse recording the sixtieth patient had to page through a visit grid and a
  // twenty-six row build-time check before the first question.
  if (variant === "plan") {
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
      ["Role", "Variable", "Field", "Datasheet column", "Where captured"],
      spec.roll_call.map((r) => [
        r.role.replace(/_/g, " "),
        labelOf(r.ref_id, fieldLabels.get(r.ref_id) ?? r.ref_id),
        r.field_variable_id ? labelOf(r.field_variable_id, fieldLabels.get(r.field_variable_id) ?? r.field_variable_id) : "NOT CAPTURED",
        // The roll-call is what an analyst reads to find a variable, so it is
        // where the spreadsheet column belongs.
        (r.field_variable_id ? columns[r.field_variable_id] : "") ?? "",
        r.where,
      ]),
    ),
  );

  doc.push(h("Collected once, collected repeatedly", HeadingLevel.HEADING_2));
  doc.push(para(`Once: ${spec.collected_once.join("; ")}.`));
  doc.push(para(`Repeatedly: ${spec.collected_repeatedly.join("; ")}.`));

    if (spec.derived.length) {
      doc.push(h("Values calculated from the form, not collected on it", HeadingLevel.HEADING_2));
      doc.push(
        italic(
          "A number the collector arrives already holding was worked out somewhere nobody can check, so the form asks for the parts and these are computed from them.",
        ),
      );
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
    }

    return Packer.toBuffer(new Document({ styles: HOUSE_STYLES, sections: [{ children: doc }] }));
  }

  /* ---- the form ----------------------------------------------------- */

  doc.push(
    new Paragraph({
      text: "CASE RECORD FORM",
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
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
      // The note under the label, where whoever is filling the form is already
      // looking. It carries the rule a calculated value is worked out from, and
      // it had been in the spec and printed nowhere.
      [
        // The datasheet column beside the label. Whoever types the filled form
        // into a spreadsheet reads this to know which column the answer goes
        // in, and the analysis blueprint names its rows by the same word.
        [
          f.primary_outcome ? `${nameOf(f)} (primary outcome)` : nameOf(f),
          f.column_name ? `[${f.column_name}]` : "",
        ]
          .filter(Boolean)
          .join("  "),
        f.note,
      ]
        .filter(Boolean)
        .join("\n"),
      f.type,
      responseFor(f),
    ]);

  doc.push(h("Form & Subject Identifiers", HeadingLevel.HEADING_2));
  doc.push(table(["S.No.", "Field / Variable", "Field type", "Response"], fieldRows(spec.identifiers)));

  const HEAD = ["S.No.", "Field / Variable", "Field type", "Response"];

  for (const section of spec.sections) {
    doc.push(h(`Section ${section.letter} - ${section.title}`, HeadingLevel.HEADING_2));
    if (section.fields.length) doc.push(table(HEAD, fieldRows(section.fields)));
    if (section.note) doc.push(italic(section.note));

    // A section's parts each get their own table under its heading, numbered
    // from the section's letter: H1, H2, H3. One level and no deeper.
    (section.sections ?? []).forEach((part, i) => {
      doc.push(h(`${section.letter}${i + 1} - ${part.title}`, HeadingLevel.HEADING_3));
      doc.push(table(HEAD, fieldRows(part.fields)));
      if (part.note) doc.push(italic(part.note));
    });
  }

  // What is calculated rather than collected is listed in the plan document,
  // and said again in the section note where the temptation to enter it is:
  // "Body mass index is calculated from height and weight. Do not enter it
  // here." A table of it on the form is a third telling nobody needs.

  return Packer.toBuffer(new Document({ styles: HOUSE_STYLES, sections: [{ children: doc }] }));
}

/** Re-exported so the renderer stays the one import a caller needs. */
export { responseFor };
