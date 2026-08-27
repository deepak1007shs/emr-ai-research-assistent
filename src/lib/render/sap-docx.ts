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
import { chooseTest, degreesOfFreedomNote } from "../sap/choose-test.ts";
import {
  analysisCell,
  dataTypeCell,
  planKey,
  predictorCell,
  tableCell,
} from "./analysis-cells.ts";
import {
  outcomeCell,
  outcomeDefinition,
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
function twoColumn(rows: [string, string][]): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: rows.map(
      ([label, value]) =>
        new TableRow({ children: [cell(label, true), cell(value)] }),
    ),
  });
}

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
  "Statistical analysis -> Table #",
];

export async function buildSapDocx(
  spec: SapSpec,
  /** Objective id to the table that reports it, once the shell tables exist. */
  tableNumbers?: Record<string, number[]>,
  options: { variant?: SapVariant } = {},
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
  const fw = spec.picot?.framework === "PICOT" ? "PICOT" : "PECOT";
  if (spec.picot && !short) {
    doc.push(heading(fw, HeadingLevel.HEADING_1));
    doc.push(
      italic(
        "The clinical question decomposed. This is what every objective, variable and test below must trace back to.",
      ),
    );
    doc.push(
      twoColumn([
        ["P - Population", spec.picot.population],
        [
          fw === "PICOT" ? "I - Intervention" : "E - Exposure",
          spec.picot.intervention_or_exposure,
        ],
        ["C - Comparator", spec.picot.comparator],
        ["O - Outcome", spec.picot.outcome],
        ["T - Time / type of study", spec.picot.time],
      ]),
    );
    doc.push(labelled("Assembled question.", spec.picot.assembled_question));
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

  if (spec.estimand && !short) {
    doc.push(heading("Primary estimand (ICH E9(R1))", HeadingLevel.HEADING_2));
    doc.push(
      italic(
        "The estimand, not the test, is what the study is trying to estimate.",
      ),
    );
    doc.push(
      twoColumn([
        ["Treatment condition", spec.estimand.treatment_condition],
        ["Population", spec.estimand.population],
        ["Endpoint", spec.estimand.endpoint],
        ["Intercurrent-event strategy", spec.estimand.intercurrent_strategy],
        ["Population-level summary", spec.estimand.summary_measure],
      ]),
    );
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

  // ---- the variable table, in the full document only
  if (!short) {
  doc.push(heading("Section 2 - Variable Table", HeadingLevel.HEADING_1));
  doc.push(
    italic(
      "One row per variable. Once the data type and the role are set, the correct test follows almost mechanically. Grouped by role: outcomes first, then predictors, then confounders, then descriptors.",
    ),
  );

  const ROLE_ORDER: Record<string, number> = {
    outcome: 0,
    predictor: 1,
    effect_modifier: 2,
    confounder: 3,
    mediator: 4,
    collider: 5,
    descriptor: 6,
  };
  const byRole = [...(spec.variables ?? [])].sort(
    (a, b) => (ROLE_ORDER[a.role] ?? 9) - (ROLE_ORDER[b.role] ?? 9),
  );
  doc.push(
    gridTable(
      ["Variable", "Data type", "Unit / coding", "Role in analysis"],
      byRole.map((v) => [
        v.label,
        v.data_type,
        v.unit_coding,
        v.role.replace(/_/g, " "),
      ]),
    ),
  );
  if (spec.priority_confounder_ids?.length) {
    doc.push(
      labelled(
        "Priority confounders for adjustment.",
        `${spec.priority_confounder_ids
          .map((id) => byVariable.get(id)?.label ?? id)
          .join(", ")}. Respecting about ten outcome events per variable.`,
      ),
    );
  }

  }

  // ---- the analysis map
  doc.push(section(3, "Analysis Map"));
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

  // ---- the notes under the map

  // The five questions in full. The map's cell carries the name and where it
  // comes from; a table cell holding all five is a paragraph nobody reads.
  const measured = (spec.outcomes ?? []).filter((o) =>
    spec.analyses.some((a) => (a.outcome_ids ?? []).includes(o.id)),
  );
  // In the short document the outcomes already have a section of their own, so
  // repeating their definitions under the map would say it twice.
  if (measured.length && !short) {
    doc.push(
      new Paragraph({
        spacing: { before: 200, after: 100 },
        children: [
          new TextRun({ text: "How each outcome is defined.", bold: true }),
        ],
      }),
    );
    for (const outcome of measured) {
      doc.push(
        new Paragraph({
          spacing: { after: 100 },
          children: [
            new TextRun({ text: `${line(outcome.what)}. `, bold: true }),
            new TextRun({ text: plain(outcomeDefinition(outcome)) }),
          ],
        }),
      );
    }
  }

  if (reasons.size) {
    doc.push(
      new Paragraph({
        spacing: { before: 200, after: 100 },
        children: [new TextRun({ text: "Why each analysis.", bold: true })],
      }),
    );
    for (const [test, why] of reasons) doc.push(para(`${test}: ${why}.`));
  }

  // What must not be done. A plan that says only what to do lets the commonest
  // mistake through in silence.
  if (avoided.size) {
    doc.push(
      new Paragraph({
        spacing: { before: 160, after: 100 },
        children: [new TextRun({ text: "What must not be done.", bold: true })],
      }),
    );
    for (const [test, avoid] of avoided) doc.push(para(`${test}: ${avoid}.`));
  }

  const adjusted = spec.analyses.find((a) => (a.adjust_for_ids ?? []).length > 0);
  if (spec.expected_events !== undefined && adjusted) {
    const predictorCount = (adjusted.adjust_for_ids ?? []).length;
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
    (v) =>
      (v.role === "mediator" || v.role === "collider") && v.exclusion_reason,
  );
  if (excluded.length) {
    doc.push(
      new Paragraph({
        spacing: { before: 160, after: 100 },
        children: [new TextRun({ text: "Not adjusted for.", bold: true })],
      }),
    );
    for (const v of excluded) {
      doc.push(para(`${v.label} is a ${v.role}. ${v.exclusion_reason}`));
    }
    doc.push(para("Neither enters any model."));
  }

  /* ---- Section 4 --------------------------------------------------- */

  if (spec.rules && !short) {
    doc.push(
      heading("Section 4 - General Statistical Rules", HeadingLevel.HEADING_1),
    );
    doc.push(
      italic(
        "Fixed upfront so they are never re-decided after seeing the data.",
      ),
    );
    doc.push(labelled("Software.", spec.rules.software));
    doc.push(labelled("Normality.", spec.rules.normality));
    doc.push(labelled("Continuous data.", spec.rules.continuous_summary));
    doc.push(labelled("Categorical data.", spec.rules.categorical_summary));
    doc.push(labelled("Significance.", spec.rules.significance));
    doc.push(labelled("Effect estimates.", spec.rules.effect_estimates));
    doc.push(labelled("Missing data.", spec.rules.missing_data));
    doc.push(labelled("Multiplicity.", spec.rules.multiplicity));
    doc.push(labelled("Reproducibility.", spec.rules.reproducibility));
  }
  if (spec.sample_size_note && !short) {
    doc.push(labelled("Sample size.", spec.sample_size_note));
  }

  if (spec.populations?.length && !short) {
    doc.push(
      heading("Analysis populations (who is analysed)", HeadingLevel.HEADING_2),
    );
    doc.push(
      gridTable(
        ["Population", "Definition"],
        spec.populations.map((p) => [p.name, p.definition]),
      ),
    );
  }

  if (spec.baseline_comparison && !short) {
    doc.push(heading("Baseline comparison", HeadingLevel.HEADING_2));
    doc.push(para(spec.baseline_comparison));
  }

  if (spec.intercurrent_events?.length && !short) {
    doc.push(heading("Intercurrent events", HeadingLevel.HEADING_2));
    doc.push(
      italic(
        "These change what is being estimated. Missing data is a separate problem, handled by the rule above.",
      ),
    );
    doc.push(
      gridTable(
        ["Event", "Strategy"],
        spec.intercurrent_events.map((e) => [e.event, e.strategy]),
      ),
    );
  }

  if (spec.testing_hierarchy && !short) {
    doc.push(
      heading("Multiplicity and testing hierarchy", HeadingLevel.HEADING_2),
    );
    doc.push(para(spec.testing_hierarchy));
  }

  if (spec.subgroups?.length && !short) {
    doc.push(
      heading("Subgroup and interaction analyses", HeadingLevel.HEADING_2),
    );
    doc.push(
      italic(
        "Pre-specified. Effect modification is tested by an interaction term, never by comparing within-subgroup p values.",
      ),
    );
    doc.push(
      gridTable(
        ["Subgroup", "How it is tested"],
        spec.subgroups.map((g) => [g.subgroup, g.how_tested]),
      ),
    );
  }

  if (spec.interim && !short) {
    doc.push(
      heading("Interim analyses and stopping rules", HeadingLevel.HEADING_2),
    );
    doc.push(para(spec.interim));
  }

  /* ---- Section 5 --------------------------------------------------- */

  if (spec.steps?.length && !short) {
    doc.push(
      heading("Section 5 - Step-by-Step Analysis Flow", HeadingLevel.HEADING_1),
    );
    doc.push(
      italic(
        "The ladder for the primary objective. The same ladder works for almost any design.",
      ),
    );
    for (const step of spec.steps)
      doc.push(labelled(`${step.step}.`, step.what));
  }

  /* ---- Section 5A -------------------------------------------------- */

  if (spec.assumption_checks?.length && !short) {
    doc.push(
      heading("Section 5A - Assumption Checking", HeadingLevel.HEADING_1),
    );
    doc.push(
      italic(
        "The assumptions belong to the test that was chosen, so only the assumptions the planned tests actually make are listed. For each: how it will be checked, what to do if it is violated, and an example in this study's own terms.",
      ),
    );

    // Grouped by test, because that is how they are read: you look up the test
    // you are about to run, not the assumption you are about to break.
    const byTest = new Map<string, typeof spec.assumption_checks>();
    for (const check of spec.assumption_checks) {
      const list = byTest.get(check.test) ?? [];
      list.push(check);
      byTest.set(check.test, list);
    }
    for (const [test, checks] of byTest) {
      doc.push(heading(test, HeadingLevel.HEADING_2));
      doc.push(
        gridTable(
          [
            "Assumption",
            "How it will be checked",
            "If violated",
            "Clinical example",
          ],
          checks.map((c) => [
            c.assumption,
            c.how_checked,
            c.if_violated,
            c.example,
          ]),
        ),
      );
    }
  }

  /* ---- Section 6 --------------------------------------------------- */

  if (!short) {
  doc.push(heading("Section 6 - Shell (Dummy) Tables", HeadingLevel.HEADING_1));
  doc.push(
    para(
      "Every empty results table the thesis will contain, in the order it will appear, is laid out in the Shell Tables document that accompanies this plan. Cells stay blank until the data arrive, and each table names the test that produced it.",
    ),
  );
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
