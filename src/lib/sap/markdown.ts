import { spaced } from "../render/plain.ts";
import type { AnalysisRow, ShellTable } from "../study/types.ts";
import { BLOCK_ORDER } from "../study/vocabulary.ts";
import type { SapBuild } from "./build.ts";
import { DIAGNOSTIC_NOTE } from "../study/diagnostic.ts";
import { labelOf } from "../variables/name.ts";

/**
 * The plan, rendered top to bottom.
 *
 * Section 7.2 of the written process gives the order and this follows it
 * exactly: title, PICOT, Section 1, the Analysis Map, Section 6. Nothing here
 * decides anything. Every sentence is either a fixed line, a value from the
 * build, or a template with the value slotted in, which is what makes two runs
 * produce one file.
 *
 * Markdown rather than Word, and the Word file is built from the same structure
 * beside this. The markdown is what the application shows on screen and what
 * the tests compare, because a byte-for-byte comparison of two .docx files
 * compares their zip timestamps as well as their contents.
 */

/* ---- the fixed lines, word for word --------------------------------- */

export const PICOT_LINE =
  "The clinical question decomposed. This is what every objective, variable and test below must trace back to.";

export const SECTION_1_LINE =
  "Every objective is phrased as a question. A question forces you to name an outcome and a predictor, which is exactly what the statistics need.";

export const MAP_LINE =
  "One row per objective, the heart of the plan. Every question is linked to its test and to the empty results table it will fill.";

export const SECTION_6_LINE =
  "Every empty results table the thesis will contain, in the exact order it will appear: descriptive tables first, separately for each block measured, then the primary-outcome tables including each adjustment model and the sensitivity table, then the secondary-outcome tables, and the exploratory tables last. Cells stay blank and no number is ever invented. Each table names the test that produced it.";

const BLOCK_HEADING: Record<string, string> = {
  descriptive: "Descriptive characteristics",
  primary: "Primary outcome",
  secondary: "Secondary outcomes",
  exploratory: "Exploratory analyses",
};

const BLOCK_LINE: Record<string, string> = {
  descriptive:
    "One table per measured block, summarised by study group. Descriptive only, with no inferential claim.",
  primary: "",
  secondary:
    "The denominators here are the subgroup and differ from the primary. Each table names its own.",
  exploratory:
    "Exploratory and not powered. No confirmatory claim is made from any of these; the confidence intervals are nominal, and a positive finding here needs prospective validation.",
};

/* ---- small helpers --------------------------------------------------- */

const italic = (text: string) => (text ? `*${text}*` : "");

/** A markdown pipe table, with the cells escaped so a pipe cannot split a row. */
function grid(headings: string[], rows: string[][]): string {
  const cell = (text: string) => text.replace(/\|/g, "\\|").trim();
  const lines = [
    `| ${headings.map(cell).join(" | ")} |`,
    `| ${headings.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${row.map(cell).join(" | ")} |`),
  ];
  return lines.join("\n");
}

/** The test cell of the Analysis Map, in the fixed order rule 4.9 gives. */
function testCell(row: AnalysisRow, label: (name: string) => string): string {
  const parts: string[] = [];
  if (row.unadjusted) {
    const fallback = row.unadjusted.fallback
      ? ` (fallback: ${row.unadjusted.fallback})`
      : "";
    parts.push(
      `Unadjusted: ${row.unadjusted.test}${fallback} → T${row.unadjusted.table}`,
    );
  }
  if (row.adjusted) {
    const covariates = row.adjusted.covariates.map((c) => label(c.var)).join(", ");
    const fallback = row.adjusted.fallback
      ? ` (fallback: ${row.adjusted.fallback})`
      : "";
    const fit = row.adjusted.fit_table ? ` (fit T${row.adjusted.fit_table})` : "";
    parts.push(
      `Adjusted: ${row.adjusted.model}${covariates ? ` + ${covariates}` : ""}${fallback} → T${row.adjusted.table}${fit}`,
    );
  }
  if (row.exception === "estimation") {
    parts.push("Estimation objective: summary with a confidence interval, no p value.");
  }
  if (row.exception === "safety") {
    parts.push("Safety outcome: reported, not modelled.");
  }
  if (row.exception === "too_few_events") {
    parts.push("Too few events to fit a model: descriptive only.");
  }
  if (row.exception === "diagnostic") parts.push(DIAGNOSTIC_NOTE);
  return parts.join("; ");
}

/** One shell table: the bold title, the empty grid, the italic footnote. */
function shell(table: ShellTable): string {
  const label = table.fit_table_of
    ? `Table ${table.number}.`
    : `Table ${table.number}.`;
  const rows = table.rows.map((row) => [
    row.label,
    ...table.columns.slice(1).map(() => ""),
  ]);
  return [
    `**${label}  ${table.title}**`,
    "",
    grid(table.columns, rows),
    "",
    italic(`Footnote: test used = ${table.footnote}`),
  ].join("\n");
}

/* ---- the document ---------------------------------------------------- */

export function renderSapMarkdown(build: SapBuild): string {
  const { facts, picot, objectives, analysis, tables, figures, rules, pinned } =
    build;
  const out: string[] = [];
  // Every line goes through the house style on its way out, so what is shown
  // on screen and what is downloaded have the same punctuation. `spaced` and
  // not `plain`: the two spaces after "Table 1." are the format, and `plain`
  // collapses them.
  const say = (...lines: string[]) => out.push(...lines.map(spaced), "");

  say("# STATISTICAL ANALYSIS PLAN");
  say(`**Statistical Analysis Plan - ${facts.title}**`);

  /* PICOT */
  say(`## ${picot.frame}`);
  say(italic(PICOT_LINE));
  say(`**Assembled question:** ${italic(picot.assembled_question)}`);
  say(
    grid(
      ["", "Element", "For this study"],
      picot.rows.map((row) => [row.letter, row.element, row.value]),
    ),
  );

  /* Section 1 */
  say("## Section 1 - Objectives as Answerable Questions");
  say(italic(SECTION_1_LINE));
  say("### Aim");
  say(picot.aim);
  say("### Hypothesis");
  say(picot.hypothesis);

  const families: [string, string][] = [
    ["primary", "Primary objective"],
    ["secondary", "Secondary objectives"],
    ["exploratory", "Exploratory objectives"],
  ];
  for (const [family, heading] of families) {
    const mine = objectives.filter((o) => o.family === family);
    if (!mine.length) continue;
    say(`### ${heading}`);
    say(
      ...mine.map(
        (o) =>
          `- **${o.id}.** ${o.question}${o.source === "hypothesis" ? " (stated in the hypothesis, not as a formal objective)" : ""}`,
      ),
    );
  }

  /* The Analysis Map */
  // Labels, never the names code uses. See `labelOf`.
  const label = (name: string) => labelOf(build.variables, name);
  say("## Analysis Map");
  say(italic(MAP_LINE));
  say(
    grid(
      ["Objective", "Outcome", "Predictor(s)", "Data type", "Statistical test → Table"],
      analysis.map((row) => {
        const objective = objectives.find((o) => o.id === row.objective);
        const family = (objective?.family ?? "").toUpperCase();
        return [
          `${family} - ${row.objective}`,
          label(row.outcome),
          row.predictors.map(label).join(", ") || "none",
          `${row.data_type.replace(/_/g, " ")}, ${row.unit_of_analysis}, ${row.count}`,
          testCell(row, label),
        ];
      }),
    ),
  );

  /* Section 6 */
  say("## Section 6 - Shell (Dummy) Tables");
  say(italic(SECTION_6_LINE));
  say(
    `This plan contains ${pinned.tables} numbered tables (T1 to T${pinned.tables}), ${pinned.fits} fit ${pinned.fits === 1 ? "table" : "tables"} and ${pinned.figures} ${pinned.figures === 1 ? "figure" : "figures"}. These numbers are the contract with the results chapter: the results are filled in under these numbers in this order, and anything added later is lettered rather than renumbered.`,
  );

  // Gap G6: the rules that every footnote refers to, printed once.
  say("### General rules");
  say(
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
  );

  say("### Analysis populations");
  say(
    ...rules.populations.map((p) => `- **${p.name}.** ${p.definition}`),
  );

  for (const block of BLOCK_ORDER) {
    const mine = tables.filter((t) => t.block === block);
    if (!mine.length) continue;

    say(`### ${BLOCK_HEADING[block]}`);
    if (BLOCK_LINE[block]) say(italic(BLOCK_LINE[block]));
    if (block === "primary") say(italic(rules.population_line));

    const note = rules.multiplicity[block as keyof typeof rules.multiplicity];
    if (note) say(italic(`Multiplicity: ${note}`));
    if (block === "secondary" && rules.multiplicity.safety) {
      say(italic(`Safety: ${rules.multiplicity.safety}`));
    }

    for (const table of mine) {
      say(shell(table));
      for (const figure of figures.filter((f) => f.after === table.number)) {
        say(`**Figure ${figure.number}.  ${figure.caption}**`);
        say(italic(`Footnote: ${figure.footnote}`));
      }
    }
  }

  /* What is still open */
  if (build.todos.length) {
    say("## Open items");
    say(
      italic(
        "Every one of these is a decision the plan will not make on the investigator's behalf. Each is a bold TODO in the document above, and the plan is not final until all of them are answered.",
      ),
    );
    say(...build.todos.map((todo) => `- **TODO:** ${todo}`));
  }

  return `${out.join("\n").replace(/\n{3,}/g, "\n\n").trim()}\n`;
}
