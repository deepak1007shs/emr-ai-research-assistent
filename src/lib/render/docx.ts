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
import type { ActionSpec, ReviewSpec } from "@/lib/protocol/schema";
import { HOUSE_BORDER, HOUSE_STYLES, plain } from "./house-style.ts";

/**
 * The Word renderer.
 *
 * Mirrors the vendored `build_review_md.js` section for section, heading for
 * heading, so the .md and the .docx are the same document in two formats. When
 * that builder changes, change this to match — `docx.test.ts` checks the
 * headings agree.
 */

/**
 * Collapses newlines the way the Markdown builder's `clean()` does, then applies
 * the house style: no em dashes, no smart punctuation, no decorative glyphs.
 */
const clean = (v?: string) => plain(String(v ?? "").replace(/\s*\n\s*/g, " "));
const bodyText = (v?: string) => plain(v);

type Block = Paragraph | Table;

function h(text: string, level: (typeof HeadingLevel)[keyof typeof HeadingLevel]) {
  return new Paragraph({ text: clean(text), heading: level, spacing: { before: 260, after: 130 } });
}

function para(text: string) {
  return new Paragraph({ text: bodyText(text), spacing: { after: 130 } });
}

function italic(text: string) {
  return new Paragraph({
    children: [new TextRun({ text: bodyText(text), italics: true })],
    spacing: { after: 130 },
  });
}

/** `**Label:** value` on one line. */
function labelled(label: string, value: string) {
  return new Paragraph({
    spacing: { after: 130 },
    children: [
      new TextRun({ text: `${clean(label)} `, bold: true }),
      new TextRun({ text: bodyText(value) }),
    ],
  });
}

function bullet(text: string, level = 0) {
  return new Paragraph({ text: clean(text), bullet: { level }, spacing: { after: 70 } });
}

/** A nested bullet that opens with a bold label, e.g. `**Outcome:** …`. */
function labelledBullet(label: string, value: string, level = 1) {
  return new Paragraph({
    bullet: { level },
    spacing: { after: 70 },
    children: [
      new TextRun({ text: `${clean(label)} `, bold: true }),
      new TextRun({ text: clean(value) }),
    ],
  });
}

function table(headers: string[], rows: (readonly string[])[]): Table {
  const n = headers.length;
  const cellOf = (text: string, bold: boolean) =>
    new TableCell({
      children: [new Paragraph({ children: [new TextRun({ text: clean(text), bold })] })],
      margins: { top: 70, bottom: 70, left: 110, right: 110 },
      borders: { top: HOUSE_BORDER, bottom: HOUSE_BORDER, left: HOUSE_BORDER, right: HOUSE_BORDER },
    });

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        tableHeader: true,
        children: headers.map((head) => cellOf(head, true)),
      }),
      // Pad short rows and truncate long ones, exactly as the builder does.
      ...rows.map((row) => {
        const cells = row.slice(0, n);
        while (cells.length < n) cells.push("");
        return new TableRow({
          children: cells.map((value, i) => cellOf(value, i === 0)),
        });
      }),
    ],
  });
}

export async function buildDocx(input: ReviewSpec | ActionSpec): Promise<Buffer> {
  // Both spec shapes render through here, exactly as they do through the
  // Markdown builder: each section appears only if its field is present.
  const spec = input as Partial<ReviewSpec> & Partial<ActionSpec> & { subtitle: string };
  const doc: Block[] = [];

  // ---- header
  doc.push(h("Protocol Understanding & Review", HeadingLevel.TITLE));
  doc.push(
    new Paragraph({
      children: [
        new TextRun({
          text: clean(spec.subtitle || "Design · Objectives · Outcomes · Sample Size · Key Issues"),
          italics: true,
        }),
      ],
      alignment: AlignmentType.LEFT,
    }),
  );
  if (spec.protocol_line) {
    doc.push(
      new Paragraph({
        children: [new TextRun({ text: bodyText(spec.protocol_line), bold: true })],
        spacing: { after: 200 },
      }),
    );
  }

  // ---- optional compact variant
  if (spec.snapshot?.rows) {
    doc.push(h("Study snapshot", HeadingLevel.HEADING_1));
    doc.push(table(["Field", "Detail"], spec.snapshot.rows));
  }
  if (spec.issues_table) {
    doc.push(h("Issues & Required Changes", HeadingLevel.HEADING_1));
    if (spec.issues_table.intro) doc.push(para(spec.issues_table.intro));
    doc.push(
      table(
        ["Area", "Issue in the study", "Change needed", "Priority"],
        spec.issues_table.rows ?? [],
      ),
    );
    if (spec.issues_table.legend) doc.push(italic(spec.issues_table.legend));
  }

  // ---- 1. Title
  if (spec.title) {
    doc.push(h("1. Title of the Study", HeadingLevel.HEADING_1));
    if (spec.title.as_written) doc.push(labelled("As written:", spec.title.as_written));
    if (spec.title.suggestions?.length) {
      doc.push(h("Suggestions (only what is needed)", HeadingLevel.HEADING_2));
      doc.push(...spec.title.suggestions.filter(bodyText).map((s) => bullet(s)));
    }
  }

  // ---- 2. Type of the study
  if (spec.type) {
    doc.push(h("2. Type of the Study", HeadingLevel.HEADING_1));
    if (spec.type.classification) {
      doc.push(labelled("Correct classification:", spec.type.classification));
    }
    if (spec.type.suggestions?.length) {
      doc.push(h("Suggestions (only what is needed)", HeadingLevel.HEADING_2));
      doc.push(...spec.type.suggestions.filter(bodyText).map((s) => bullet(s)));
    }
  }

  // ---- 3. PICO / PECO
  if (spec.peco) {
    const fw = spec.peco.framework === "PICO" ? "PICO" : "PECO";
    const kind = fw === "PICO" ? "Intervention" : "Exposure";
    doc.push(h(`3. ${fw} (${kind} question)`, HeadingLevel.HEADING_1));
    if (spec.peco.intro) doc.push(para(spec.peco.intro));
    if (spec.peco.rows) doc.push(table(["Element", "Content"], spec.peco.rows));
  }

  // ---- 4. Objectives and their outcomes
  if (spec.objectives) {
    doc.push(h("4. Objectives and Their Outcomes", HeadingLevel.HEADING_1));
    const o = spec.objectives;

    if (o.primary) {
      doc.push(h("Primary objective", HeadingLevel.HEADING_2));
      if (o.primary.objective) {
        doc.push(
          new Paragraph({
            bullet: { level: 0 },
            spacing: { after: 70 },
            children: [new TextRun({ text: clean(o.primary.objective), bold: true })],
          }),
        );
        if (o.primary.outcome) {
          doc.push(labelledBullet("Primary outcome:", o.primary.outcome));
        }
      } else if (o.primary.outcome) {
        doc.push(labelled("Primary outcome:", o.primary.outcome));
      }
    }

    if (o.secondary?.length) {
      doc.push(h("Secondary objectives and their outcomes", HeadingLevel.HEADING_2));
      for (const s of o.secondary) {
        doc.push(bullet(s.objective));
        if (s.outcome) doc.push(labelledBullet("Outcome:", s.outcome));
      }
    }

    if (o.exploratory?.length) {
      doc.push(
        h("Exploratory objectives (extra analyses that can be done)", HeadingLevel.HEADING_2),
      );
      for (const e of o.exploratory) {
        doc.push(bullet(e.text));
        if (e.outcome) doc.push(labelledBullet("Outcome:", e.outcome));
      }
    }
  }

  // (No variables section — by design. Variable problems live in key_issues.)

  // ---- 5. Sample size
  if (spec.sample_size) {
    doc.push(h("5. Sample Size — Is It Correct? Any Issues?", HeadingLevel.HEADING_1));
    const s = spec.sample_size;
    if (s.what_they_did) doc.push(labelled("What the protocol did:", s.what_they_did));
    if (s.verdict) doc.push(labelled("Verdict:", s.verdict));
    if (s.issues?.length) {
      doc.push(h("Issues to fix", HeadingLevel.HEADING_2));
      doc.push(...s.issues.filter(bodyText).map((i) => bullet(i)));
    }
  }

  // ---- 6. Very important issues
  if (spec.key_issues?.length) {
    doc.push(h("6. Very Important Issues to Address (in plain words)", HeadingLevel.HEADING_1));
    doc.push(para("The most important things to fix before the study starts:"));
    spec.key_issues.forEach(([headingText, bodyPara], i) => {
      doc.push(h(`${i + 1}. ${headingText}`, HeadingLevel.HEADING_2));
      if (bodyPara) doc.push(para(bodyPara));
    });
  }

  // ---- footer
  if (spec.footer) {
    doc.push(italic(spec.footer));
  }

  return Packer.toBuffer(new Document({ styles: HOUSE_STYLES, sections: [{ children: doc }] }));
}
