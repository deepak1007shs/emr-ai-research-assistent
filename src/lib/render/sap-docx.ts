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
  outcomeCell,
  outcomeDefinition,
  outcomeIndex,
  variableIndex,
  type SapSpec,
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
  "Statistical test -> Table #",
];

export async function buildSapDocx(
  spec: SapSpec,
  /** Objective id to the table that reports it, once the shell tables exist. */
  tableNumbers?: Record<string, number>,
): Promise<Buffer> {
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

  // ---- Section 0. Guarded, because a plan read back from a row is whatever
  // was stored, not whatever the current type says.
  if (spec.glance) {
    doc.push(heading("Section 0 - Study at a Glance", HeadingLevel.HEADING_1));
    doc.push(
      italic(
        "A thirty-second summary. If a reader sees only this box, they should be able to say what the study is.",
      ),
    );
    doc.push(
      twoColumn([
        ["Title", spec.title],
        ["Design", spec.design],
        ["Population", spec.glance.population],
        ["What is measured", spec.glance.what_is_measured],
        ["Primary outcome", spec.glance.primary_outcome],
        ["Main comparison", spec.glance.main_comparison],
        ["Sample size", spec.glance.sample_size_basis],
        ["Reporting guideline", spec.guideline],
      ]),
    );
    if (spec.sample_size_note) {
      doc.push(labelled("Sample-size note.", spec.sample_size_note));
    }
  }

  // ---- the clinical question decomposed
  const fw = spec.picot?.framework === "PICOT" ? "PICOT" : "PECOT";
  if (spec.picot) {
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

  // ---- Section 1
  doc.push(
    heading(
      "Section 1 - Objectives as Answerable Questions",
      HeadingLevel.HEADING_1,
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

  if (spec.hypothesis) {
    doc.push(heading("Hypothesis", HeadingLevel.HEADING_2));
    doc.push(para(spec.hypothesis));
  }

  if (spec.estimand) {
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

  // ---- Section 2
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

  // ---- Section 3
  doc.push(heading("Section 3 - Analysis Map", HeadingLevel.HEADING_1));
  doc.push(
    italic(
      "One row per objective. Every question is linked to its test AND to the empty results table it will fill.",
    ),
  );

  const reasons = new Map<string, string>();
  const rows = spec.analyses.map((row) => {
    const chosen = chooseTest(row);
    if (chosen) reasons.set(chosen.test, chosen.why);
    const number = tableNumbers?.[row.objective_id];
    const where = number ? `Table ${number}` : row.table_id;
    const test = chosen
      ? `${chosen.test} -> ${where}`
      : `NO RULE COVERS THIS ROW. Decide the test and record it. -> ${where}`;

    const outcome = byOutcome.get(row.outcome_id);
    const predictors = (row.predictor_ids ?? [])
      .map((id) => byVariable.get(id)?.label ?? id)
      .join(", ");

    return [
      row.label,
      outcome ? outcomeCell(outcome) : `UNKNOWN OUTCOME ${row.outcome_id}`,
      predictors || "(single-group estimate)",
      row.data_type,
      test,
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
    spec.analyses.some((a) => a.outcome_id === o.id),
  );
  if (measured.length) {
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
        children: [new TextRun({ text: "Why each test.", bold: true })],
      }),
    );
    for (const [test, why] of reasons) doc.push(para(`${test}: ${why}.`));
  }

  const adjusted = spec.analyses.find((a) => a.comparison === "adjusted");
  if (spec.expected_events !== undefined && adjusted) {
    const predictorCount = (adjusted.predictor_ids ?? []).length;
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

  if (spec.rules) {
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

  if (spec.populations?.length) {
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

  if (spec.baseline_comparison) {
    doc.push(heading("Baseline comparison", HeadingLevel.HEADING_2));
    doc.push(para(spec.baseline_comparison));
  }

  if (spec.intercurrent_events?.length) {
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

  if (spec.testing_hierarchy) {
    doc.push(
      heading("Multiplicity and testing hierarchy", HeadingLevel.HEADING_2),
    );
    doc.push(para(spec.testing_hierarchy));
  }

  if (spec.subgroups?.length) {
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

  if (spec.interim) {
    doc.push(
      heading("Interim analyses and stopping rules", HeadingLevel.HEADING_2),
    );
    doc.push(para(spec.interim));
  }

  /* ---- Section 5 --------------------------------------------------- */

  if (spec.steps?.length) {
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

  if (spec.assumption_checks?.length) {
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

  doc.push(heading("Section 6 - Shell (Dummy) Tables", HeadingLevel.HEADING_1));
  doc.push(
    para(
      "Every empty results table the thesis will contain, in the order it will appear, is laid out in the Shell Tables document that accompanies this plan. Cells stay blank until the data arrive, and each table names the test that produced it.",
    ),
  );

  /* ---- Section 7 --------------------------------------------------- */

  if (spec.flags?.length) {
    doc.push(heading("Section 7 - Needs Checking", HeadingLevel.HEADING_1));
    doc.push(
      italic(
        "Decisions still open. Keeping this list is what turns the plan into a working tool rather than a finished-looking wall of text. Settle each with your guide before the plan is signed.",
      ),
    );
    doc.push(
      gridTable(
        ["Open decision", "Why it matters"],
        spec.flags.map((f) => [f.flag, f.why]),
      ),
    );
  }

  /* ---- sign-off ---------------------------------------------------- */

  doc.push(heading("Document control and sign-off", HeadingLevel.HEADING_1));
  doc.push(
    para(
      "Finalise, date and sign this plan before database lock and unblinding. Every analysis above is pre-specified; any change after the sign-off date is a dated amendment recording the version, the reason and who approved it.",
    ),
  );
  doc.push(
    twoColumn([
      ["SAP version", "____"],
      ["Date finalised", "____"],
      ["Prepared by", "____"],
      ["Approved by (guide / supervisor)", "____"],
      ["Amendment log", "version - date - change - reason - approved by"],
    ]),
  );

  doc.push(
    italic(
      "Generated from the study specification. Do not edit this document: change the specification and rebuild, or the analysis plan, the case record form and the shell tables will disagree.",
    ),
  );

  return Packer.toBuffer(
    new Document({ styles: HOUSE_STYLES, sections: [{ children: doc }] }),
  );
}
