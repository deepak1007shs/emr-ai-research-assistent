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
import { shellTableSection } from "./shell-tables.ts";
import type { ShellTablesSpec } from "../tables/types.ts";
import { chooseTest } from "../sap/choose-test.ts";
import { PICOT_COLUMNS, PICOT_HEADING, picotRows } from "../sap/picot.ts";
import {
  analysisCell,
  dataTypeCell,
  planKey,
  predictorCell,
  tableCell,
} from "./analysis-cells.ts";
import {
  outcomeCell,
  outcomeIndex,
  variableIndex,
  type SapSpec,
  type SapVariant,
} from "../sap/types.ts";

/**
 * The Statistical Analysis Plan: two sections.
 *
 * Objectives as answerable questions, then the analysis map that links each one
 * to its test and to the table it will fill. Everything passes through plain(),
 * so no em dash or smart quote can reach the page.
 */

type Block = Paragraph | Table;

const line = (v?: string) => plain(String(v ?? "").replace(/\s*\n\s*/g, " "));

function heading(
  text: string,
  level: (typeof HeadingLevel)[keyof typeof HeadingLevel],
) {
  return new Paragraph({
    text: line(text),
    heading: level,
    spacing: { before: 280, after: 140 },
  });
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

/** The Item / Your study shape Sections 0 and the PICOT box both use. */
/** A table with a header row, for the variable table and the checks. */
function gridTable(headers: string[], rows: string[][]): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        tableHeader: true,
        children: headers.map((h) => cell(h, true)),
      }),
      ...rows.map((r) => new TableRow({ children: r.map((v) => cell(v)) })),
    ],
  });
}

/** A bold lead-in then the text, as the rules section prints. */
function labelled(label: string, value: string) {
  return new Paragraph({
    spacing: { after: 100 },
    children: [
      new TextRun({ text: `${line(label)} `, bold: true }),
      new TextRun({ text: plain(value) }),
    ],
  });
}

function cell(text: string, bold = false) {
  return new TableCell({
    children: [
      new Paragraph({ children: [new TextRun({ text: line(text), bold })] }),
    ],
    margins: { top: 70, bottom: 70, left: 110, right: 110 },
    borders: {
      top: HOUSE_BORDER,
      bottom: HOUSE_BORDER,
      left: HOUSE_BORDER,
      right: HOUSE_BORDER,
    },
  });
}

const HEADERS = [
  "Objective",
  "Outcome",
  "Predictor(s)",
  "Data type",
  "Statistical test -> Table #",
];

export async function buildSapDocx(
  spec: SapSpec,
  /** Objective id to the table that reports it, once the shell tables exist. */
  tableNumbers?: Record<string, number[]>,
  options: {
    variant?: SapVariant;
    /**
     * The shell tables, printed here as Section 6.
     *
     * Optional because the plan is built before them and must still render.
     */
    shells?: ShellTablesSpec | null;
  } = {},
): Promise<Buffer> {
  const short = options.variant === "short";

  /**
   * The short document does not carry the full one's section numbers. Reusing
   * them would say it is Sections 1 to 3 of the plan, and it is not: it is a
   * different cut of the same plan, and its middle section is the outcomes
   * rather than the variable table.
   */
  const section = (number: number, title: string) =>
    heading(short ? title : `Section ${number} - ${title}`, HeadingLevel.HEADING_1);

  const doc: Block[] = [];

  doc.push(
    new Paragraph({
      text: "STATISTICAL ANALYSIS PLAN",
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
      spacing: { after: short ? 60 : 160 },
    }),
  );
  if (short) {
    doc.push(
      new Paragraph({
        children: [
          new TextRun({ text: "Objectives, outcomes and the analysis map", italics: true }),
        ],
        alignment: AlignmentType.CENTER,
        spacing: { after: 160 },
      }),
    );
  }
  doc.push(
    new Paragraph({
      children: [new TextRun({ text: plain(spec.title), bold: true })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 280 },
    }),
  );

  doc.push(
    new Paragraph({
      children: [
        new TextRun({
          text: plain(`${spec.design}. ${spec.setting}`),
          italics: true,
        }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { after: 280 },
    }),
  );

  // ---- the clinical question decomposed
  if (spec.picot && !short) {
    doc.push(heading(PICOT_HEADING, HeadingLevel.HEADING_1));
    doc.push(
      italic(
        "The clinical question decomposed. This is what every objective, variable and test below must trace back to.",
      ),
    );
    doc.push(gridTable(PICOT_COLUMNS, picotRows(spec.picot)));
    doc.push(labelled("Assembled question:", spec.picot.assembled_question));
  }

  // ---- objectives
  doc.push(
    section(
      1,
      "Objectives as Answerable Questions",
    ),
  );
  doc.push(
    italic(
      "Every objective is phrased as a question, because a question forces you to name an outcome and a predictor, which is exactly what the statistics need.",
    ),
  );

  doc.push(heading("Aim", HeadingLevel.HEADING_2));
  doc.push(para(spec.aim));

  // Labels come from the registry, never from a copy held here, so this document
  // cannot describe a variable differently from the form or the tables.
  const byVariable = variableIndex(spec);
  const byOutcome = outcomeIndex(spec);

  const primary = spec.objectives.filter((o) => o.tier === "primary");
  const secondary = spec.objectives.filter((o) => o.tier === "secondary");
  const exploratory = spec.objectives.filter((o) => o.tier === "exploratory");

  if (spec.hypothesis && !short) {
    doc.push(heading("Hypothesis", HeadingLevel.HEADING_2));
    doc.push(para(spec.hypothesis));
  }

  doc.push(heading("Primary objective(s)", HeadingLevel.HEADING_2));
  for (const o of primary) doc.push(objectiveBullet(o.id, o.question));

  if (secondary.length) {
    doc.push(heading("Secondary objectives", HeadingLevel.HEADING_2));
    for (const o of secondary) doc.push(objectiveBullet(o.id, o.question));
  }
  if (exploratory.length) {
    doc.push(
      heading(
        "Exploratory objectives (hypothesis-generating, not powered)",
        HeadingLevel.HEADING_2,
      ),
    );
    for (const o of exploratory) doc.push(objectiveBullet(o.id, o.question));
  }

  // ---- outcomes, in the short document only, where they are the point
  if (short) {
    const measuredOutcomes = (spec.outcomes ?? []).filter((o) =>
      spec.analyses.some((a) => (a.outcome_ids ?? []).includes(o.id)),
    );
    if (measuredOutcomes.length) {
      doc.push(section(2, "Outcomes"));
      doc.push(
        italic(
          "An outcome is not defined until five questions are answered: what exactly is measured, how, using which instrument, at what time, and in which units.",
        ),
      );
      doc.push(
        gridTable(
          ["Outcome", "How it is measured", "Instrument", "When", "Units"],
          measuredOutcomes.map((o) => [o.what, o.how, o.instrument, o.when, o.units]),
        ),
      );
    }
  }

  // ---- the analysis map
  doc.push(heading("Analysis Map", HeadingLevel.HEADING_1));
  doc.push(
    italic(
      "One row per objective, or per group of objectives that share an analysis. Every question is linked to its analysis, unadjusted and adjusted, AND to the empty results tables it will fill.",
    ),
  );

  const reasons = new Map<string, string>();
  const avoided = new Map<string, string>();

  const rows = spec.analyses.map((row) => {
    // The rule table is consulted for the reasoning, but the decision itself is
    // read back from the row where the plan wrote it. Otherwise editing
    // test-rules.md would silently change what a stored plan says it will do,
    // and the shell tables built from that plan would no longer agree with it.
    const chosen = chooseTest(row);
    const plan =
      chosen && (row.test || row.test_adjusted || row.avoid)
        ? {
            ...chosen,
            unadjusted: row.test ?? chosen.unadjusted,
            adjusted: row.test_adjusted ?? chosen.adjusted,
            avoid: row.avoid ?? chosen.avoid,
          }
        : chosen;
    if (plan) {
      reasons.set(planKey(plan), plan.why);
      if (plan.avoid) avoided.set(planKey(plan), plan.avoid);
    }

    // One analysis can fill several tables: the unadjusted estimate, the
    // adjusted model, and any sensitivity table beside them.
    const where = tableCell(row, tableNumbers);

    return [
      row.label,
      (row.outcome_ids ?? [])
        .map((id) => {
          const outcome = byOutcome.get(id);
          return outcome ? outcomeCell(outcome) : `UNKNOWN OUTCOME ${id}`;
        })
        .join("; "),
      predictorCell(row, byVariable),
      dataTypeCell(row),
      plan
        ? `${analysisCell(plan, row)} -> ${where}`
        : `NO RULE COVERS THIS ROW. Decide the analysis and record it. -> ${where}`,
    ];
  });

  doc.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({
          tableHeader: true,
          children: HEADERS.map((h) => cell(h, true)),
        }),
        ...rows.map(
          (r) => new TableRow({ children: r.map((v, i) => cell(v, i === 0)) }),
        ),
      ],
    }),
  );

  /* ---- Section 6 --------------------------------------------------- */

  if (!short) {
    doc.push(heading("Section 6 - Shell (Dummy) Tables", HeadingLevel.HEADING_1));
    doc.push(
      para(
        "Every empty results table the thesis will contain, in the order it will appear. Cells stay blank until the data arrive, and each table names the test that fills it.",
      ),
    );
    // Printed here rather than pointed at. This section used to hold a sentence
    // saying the tables were in another document, which meant two documents,
    // one of which existed to say where the other was.
    if (options.shells?.tables?.length) {
      doc.push(...shellTableSection(options.shells));
    } else {
      doc.push(
        para(
          "The tables have not been built yet. Build them and this section fills in: the plan is written first, and the tables are laid out from it.",
        ),
      );
    }
  }

  doc.push(
    italic(
      "Generated from the study specification. Do not edit this document: change the specification and rebuild, or the analysis plan, the case record form and the shell tables will disagree.",
    ),
  );

  return Packer.toBuffer(
    new Document({ styles: HOUSE_STYLES, sections: [{ children: doc }] }),
  );
}
