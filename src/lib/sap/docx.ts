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
import { HOUSE_BORDER, HOUSE_STYLES, spaced } from "../render/house-style.ts";
import { BLOCK_ORDER } from "../study/vocabulary.ts";
import type { ShellTable } from "../study/types.ts";
import type { SapBuild } from "./build.ts";
import { DIAGNOSTIC_NOTE } from "../study/diagnostic.ts";
import { labelOf } from "../variables/name.ts";
import {
  MAP_LINE,
  PICOT_LINE,
  SECTION_1_LINE,
  SECTION_6_LINE,
} from "./markdown.ts";

/**
 * The plan as a Word file.
 *
 * The same objects the markdown renderer reads, in the same order, so the two
 * are one document in two formats. `sap/markdown.ts` is the one that is tested
 * line by line, because comparing two .docx files byte for byte compares their
 * zip timestamps as well as their contents; this file is checked against it by
 * heading and by table count.
 *
 * House style throughout: Times New Roman 12pt, black, plain borders, and every
 * value cell blank.
 */

const text = (value?: string) => spaced(String(value ?? "").replace(/\s*\n\s*/g, " "));

type Block = Paragraph | Table;

const heading = (value: string, level: (typeof HeadingLevel)[keyof typeof HeadingLevel]) =>
  new Paragraph({
    text: text(value),
    heading: level,
    spacing: { before: 260, after: 130 },
  });

/**
 * A line that may contain a bold TODO.
 *
 * The house style prints an open item in bold, and the stored label carries it
 * as the markdown `**TODO:**`. Splitting on the marker is what turns one into
 * the other without a markdown parser, and every line in the file goes through
 * it: the marker was leaking into the footnotes when only the bullets did.
 */
function runsOf(value: string, base: { bold?: boolean; italics?: boolean } = {}) {
  return text(value)
    .split(/(\*\*TODO:\*\*)/g)
    .filter(Boolean)
    .map((part) =>
      part === "**TODO:**"
        ? new TextRun({ text: "TODO:", bold: true, italics: base.italics })
        : new TextRun({ text: part, ...base }),
    );
}

const para = (value: string) =>
  new Paragraph({ children: runsOf(value), spacing: { after: 130 } });

const italic = (value: string) =>
  new Paragraph({
    children: runsOf(value, { italics: true }),
    spacing: { after: 130 },
  });

const bullet = (value: string) =>
  new Paragraph({ children: runsOf(value), bullet: { level: 0 }, spacing: { after: 70 } });

/** The bold title line above a shell table: "Table 6.  Rate of change...". */
const tableTitle = (value: string) =>
  new Paragraph({
    children: [new TextRun({ text: text(value), bold: true })],
    spacing: { before: 200, after: 100 },
  });

function grid(headers: string[], rows: string[][]): Table {
  const cell = (value: string, bold: boolean) =>
    new TableCell({
      children: [new Paragraph({ children: runsOf(value, { bold }) })],
      margins: { top: 70, bottom: 70, left: 110, right: 110 },
      borders: {
        top: HOUSE_BORDER,
        bottom: HOUSE_BORDER,
        left: HOUSE_BORDER,
        right: HOUSE_BORDER,
      },
    });

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        tableHeader: true,
        children: headers.map((head) => cell(head, true)),
      }),
      ...rows.map(
        (row) =>
          new TableRow({
            children: headers.map((_, i) => cell(row[i] ?? "", i === 0)),
          }),
      ),
    ],
  });
}

/** Title, empty grid, footnote: the three parts every shell table has (6.1.1). */
function shell(table: ShellTable): Block[] {
  return [
    tableTitle(`Table ${table.number}.  ${table.title}`),
    grid(
      table.columns,
      // Every cell after the first stays blank, and nothing ever fills one.
      table.rows.map((row) => [row.label, ...table.columns.slice(1).map(() => "")]),
    ),
    italic(`Footnote: test used = ${table.footnote}`),
  ];
}

/**
 * Which of the two documents to build.
 *
 * `full` is the plan. `short` is the first half of it - the question, the
 * objectives, the outcomes and the Analysis Map - for the supervisor who wants
 * to agree what is being asked before reading forty pages of empty tables.
 *
 * One function builds both, on purpose. Two would answer the same question
 * differently within a month, which is the failure this repository already has
 * a test for.
 */
export type SapVariant = "full" | "short";

export async function buildSapDocx(
  build: SapBuild,
  variant: SapVariant = "full",
): Promise<Buffer> {
  const { facts, picot, objectives, analysis, tables, figures, rules, pinned } =
    build;
  const body: Block[] = [];

  const short = variant === "short";
  // Labels, never the names code uses. See `labelOf`.
  const label = (name: string) => labelOf(build.variables, name);

  body.push(
    new Paragraph({
      children: [
        new TextRun({
          text: short
            ? "STATISTICAL ANALYSIS PLAN - SUMMARY"
            : "STATISTICAL ANALYSIS PLAN",
          bold: true,
        }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { after: 130 },
    }),
    new Paragraph({
      children: [
        new TextRun({ text: text(`Statistical Analysis Plan - ${facts.title}`), bold: true }),
      ],
      spacing: { after: 260 },
    }),
  );

  if (short) {
    body.push(
      italic(
        `The question, the objectives, the outcomes and the analysis for each one. The full plan carries these and the ${pinned.tables} empty results tables as well, along with every open item the plan will not decide on the investigator's behalf.`,
      ),
    );
  }

  /* PICOT */
  body.push(heading(picot.frame, HeadingLevel.HEADING_1), italic(PICOT_LINE));
  body.push(
    new Paragraph({
      spacing: { after: 130 },
      children: [
        new TextRun({ text: "Assembled question: ", bold: true }),
        new TextRun({ text: text(picot.assembled_question), italics: true }),
      ],
    }),
  );
  body.push(
    grid(
      ["", "Element", "For this study"],
      picot.rows.map((row) => [row.letter, row.element, row.value]),
    ),
  );

  /* Section 1 */
  body.push(
    heading("Section 1 - Objectives as Answerable Questions", HeadingLevel.HEADING_1),
    italic(SECTION_1_LINE),
    heading("Aim", HeadingLevel.HEADING_2),
    para(picot.aim),
    heading("Hypothesis", HeadingLevel.HEADING_2),
    para(picot.hypothesis),
  );

  for (const [family, label] of [
    ["primary", "Primary objective"],
    ["secondary", "Secondary objectives"],
    ["exploratory", "Exploratory objectives"],
  ] as const) {
    const mine = objectives.filter((o) => o.family === family);
    if (!mine.length) continue;
    body.push(heading(label, HeadingLevel.HEADING_2));
    for (const objective of mine) {
      body.push(
        bullet(
          `${objective.id}. ${objective.question}${objective.source === "hypothesis" ? " (stated in the hypothesis, not as a formal objective)" : ""}`,
        ),
      );
    }
  }

  // The outcomes, walked down the chain. In the short form only: the full plan
  // carries the same definitions in the title and footnote of every table that
  // reports one, and printing them twice would be two places to edit.
  if (short) {
    body.push(
      heading("Outcomes", HeadingLevel.HEADING_2),
      italic(
        "What each outcome measures, how, with which instrument, at which visits and in what unit. Every analysis below reports one of these and nothing else.",
      ),
      grid(
        ["Family", "Outcome", "How it is measured", "Instrument", "Visits", "Unit", "Type"],
        [
          [facts.primary, "Primary"] as const,
          ...facts.secondary.map((chain, i) => [chain, `Secondary ${i + 1}`] as const),
        ].map(([chain, family]) => [
          family,
          chain.what,
          chain.how,
          chain.instrument,
          chain.time
            .map(
              (code) =>
                facts.visit_schedule.find((v) => v.timepoint === code)?.label ?? code,
            )
            .join(", "),
          chain.unit,
          chain.type.replace(/_/g, " "),
        ]),
      ),
    );
  }

  /* The Analysis Map */
  body.push(heading("Analysis Map", HeadingLevel.HEADING_1), italic(MAP_LINE));
  body.push(
    grid(
      ["Objective", "Outcome", "Predictor(s)", "Data type", "Statistical test to Table"],
      analysis.map((row) => {
        const family =
          objectives.find((o) => o.id === row.objective)?.family ?? "";
        const parts: string[] = [];
        if (row.unadjusted) {
          parts.push(`Unadjusted: ${row.unadjusted.test} to T${row.unadjusted.table}`);
        }
        if (row.adjusted) {
          const covariates = row.adjusted.covariates.map((c) => label(c.var)).join(", ");
          parts.push(
            `Adjusted: ${row.adjusted.model}${covariates ? ` + ${covariates}` : ""} to T${row.adjusted.table}${row.adjusted.fit_table ? ` (fit T${row.adjusted.fit_table})` : ""}`,
          );
        }
        if (row.exception === "safety") parts.push("Safety outcome: reported, not modelled.");
        if (row.exception === "estimation") {
          parts.push("Estimation objective: interval, no p value.");
        }
        if (row.exception === "diagnostic") parts.push(DIAGNOSTIC_NOTE);
        return [
          `${family.toUpperCase()} - ${row.objective}`,
          label(row.outcome),
          row.predictors.map(label).join(", ") || "none",
          `${row.data_type.replace(/_/g, " ")}, ${row.unit_of_analysis}, ${row.count}`,
          parts.join("; "),
        ];
      }),
    ),
  );

  if (short) {
    // The open items are left out because the short form is a summary of what
    // is being asked, not the plan itself. The line above says where they are.
    return Buffer.from(
      await Packer.toBuffer(
        new Document({ styles: HOUSE_STYLES, sections: [{ children: body }] }),
      ),
    );
  }

  /* Section 6 */
  body.push(
    heading("Section 6 - Shell (Dummy) Tables", HeadingLevel.HEADING_1),
    italic(SECTION_6_LINE),
    para(
      `This plan contains ${pinned.tables} numbered tables (T1 to T${pinned.tables}), ${pinned.fits} fit ${pinned.fits === 1 ? "table" : "tables"} and ${pinned.figures} ${pinned.figures === 1 ? "figure" : "figures"}. These numbers are the contract with the results chapter.`,
    ),
    heading("General rules", HeadingLevel.HEADING_2),
    italic(
      [
        `Software: ${rules.software}`,
        `Significance: alpha of ${rules.alpha}, ${rules.sided}-sided, with ${rules.ci_level} confidence intervals.`,
        rules.summaries,
        rules.normality,
        `Missing data: ${rules.missing_data}`,
        `Interim analysis: ${rules.interim}`,
      ].join(" "),
    ),
    heading("Analysis populations", HeadingLevel.HEADING_2),
    ...rules.populations.map((p) => bullet(`${p.name}. ${p.definition}`)),
  );

  const BLOCK_HEADING: Record<string, string> = {
    descriptive: "Descriptive characteristics",
    primary: "Primary outcome",
    secondary: "Secondary outcomes",
    exploratory: "Exploratory analyses",
  };

  for (const block of BLOCK_ORDER) {
    const mine = tables.filter((t) => t.block === block);
    if (!mine.length) continue;

    body.push(heading(BLOCK_HEADING[block], HeadingLevel.HEADING_2));
    if (block === "primary") body.push(italic(rules.population_line));
    const note = rules.multiplicity[block as keyof typeof rules.multiplicity];
    if (note) body.push(italic(`Multiplicity: ${note}`));
    if (block === "secondary" && rules.multiplicity.safety) {
      body.push(italic(`Safety: ${rules.multiplicity.safety}`));
    }

    for (const table of mine) {
      body.push(...shell(table));
      // Where the build put it, not where this renderer would have guessed.
      for (const figure of figures.filter((f) => f.after === table.number)) {
        body.push(
          tableTitle(`Figure ${figure.number}.  ${figure.caption}`),
          italic(`Footnote: ${figure.footnote}`),
        );
      }
    }
  }

  if (build.todos.length) {
    body.push(
      heading("Open items", HeadingLevel.HEADING_1),
      italic(
        "Every one of these is a decision the plan will not make on the investigator's behalf. The plan is not final until all of them are answered.",
      ),
      ...build.todos.map((todo) => bullet(`**TODO:** ${todo}`)),
    );
  }

  const document = new Document({
    styles: HOUSE_STYLES,
    sections: [{ children: body }],
  });

  return Buffer.from(await Packer.toBuffer(document));
}
