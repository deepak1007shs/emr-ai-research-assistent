import { chooseTest, degreesOfFreedomNote } from "../sap/choose-test.ts";
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
import { line, plain } from "./plain.ts";
import {
  BLOCK_HEADING,
  BLOCK_NOTE_LABEL,
  BLOCK_ORDER,
  blockNote,
} from "../tables/block-notes.ts";
import { rowLabels } from "../tables/describe.ts";
import type { ShellTablesSpec } from "../tables/types.ts";

/**
 * The Statistical Analysis Plan as Markdown.
 *
 * Mirrors sap-docx.ts section for section, so the plan can be read in a
 * terminal, pasted into an email or committed beside a protocol without
 * opening Word. `sap-md.test.ts` holds the two to the same sections, because a
 * second renderer that drifts is worse than no second renderer.
 */

const HEADERS = ["Objective", "Outcome", "Predictor(s)", "Data type", "Statistical test -> Table #"];

/** A pipe inside a cell would end the column early. */
const cell = (value: string) => line(value).replace(/\|/g, "\\|");

function table(headers: string[], rows: string[][]): string {
  const head = `| ${headers.map(cell).join(" | ")} |`;
  const rule = `|${headers.map(() => "---").join("|")}|`;
  const body = rows.map((row) => `| ${row.map(cell).join(" | ")} |`);
  return [head, rule, ...body].join("\n");
}

export function buildSapMarkdown(
  spec: SapSpec,
  /** Objective id to the table that reports it, once the shell tables exist. */
  tableNumbers?: Record<string, number[]>,
  options: { variant?: SapVariant; shells?: ShellTablesSpec | null } = {},
): string {
  const short = options.variant === "short";

  // The short document does not carry the full one's section numbers: it is a
  // different cut of the same plan, not Sections 1 to 3 of it.
  const section = (number: number, title: string) =>
    short ? `## ${title}` : `## Section ${number} - ${title}`;

  const byVariable = variableIndex(spec);
  const byOutcome = outcomeIndex(spec);

  const objectives = spec.objectives ?? [];
  const analyses = spec.analyses ?? [];

  const out: string[] = [];
  const push = (...parts: string[]) => out.push(...parts);

  push("# STATISTICAL ANALYSIS PLAN", "");
  if (short) push("*Objectives, outcomes and the analysis map*", "");
  push(`**${plain(spec.title)}**`, "");
  if (spec.design || spec.setting) {
    push(`*${plain([spec.design, spec.setting].filter(Boolean).join(". "))}*`, "");
  }

  /* ---- the clinical question --------------------------------------- */

  if (spec.picot && !short) {
    push("---", "", `## ${PICOT_HEADING}`, "");
    push(
      "*The clinical question decomposed. This is what every objective, variable and test below must trace back to.*",
      "",
    );
    push(
      table(
        PICOT_COLUMNS,
        picotRows(spec.picot).map(([letter, element, value]) => [letter, element, value]),
      ),
      "",
    );
    push(`**Assembled question:** ${plain(spec.picot.assembled_question)}`, "");
  }

  /* ---- Section 1 --------------------------------------------------- */

  push("---", "", section(1, "Objectives as Answerable Questions"), "");
  push(
    "*Every objective is phrased as a question, because a question forces you to name an outcome and a predictor, which is exactly what the statistics need.*",
    "",
  );
  push("### Aim", "", plain(spec.aim), "");

  if (spec.hypothesis && !short) push("### Hypothesis", "", plain(spec.hypothesis), "");

  const tier = (name: string, want: string) => {
    const items = objectives.filter((o) => o.tier === want);
    if (!items.length) return;
    push(`### ${name}`, "");
    for (const o of items) push(`- **${line(o.id)}:** ${plain(o.question)}`);
    push("");
  };
  tier("Primary objective(s)", "primary");
  tier("Secondary objectives", "secondary");
  tier("Exploratory objectives (hypothesis-generating, not powered)", "exploratory");

  /* ---- the outcomes, in the short document only --------------------- */

  // The outcomes get a section of their own in the short document, where they
  // are the point rather than a note under the map.
  if (short) {
    const measuredOutcomes = (spec.outcomes ?? []).filter((o) =>
      analyses.some((a) => (a.outcome_ids ?? []).includes(o.id)),
    );
    if (measuredOutcomes.length) {
      push("---", "", section(2, "Outcomes"), "");
      push(
        "*An outcome is not defined until five questions are answered: what exactly is measured, how, using which instrument, at what time, and in which units.*",
        "",
      );
      push(
        table(
          ["Outcome", "How it is measured", "Instrument", "When", "Units"],
          measuredOutcomes.map((o) => [o.what, o.how, o.instrument, o.when, o.units]),
        ),
        "",
      );
    }
  }

  push("---", "", "## Analysis Map", "");
  push(
    "*One row per objective, or per group of objectives that share an analysis. Every question is linked to its analysis, unadjusted and adjusted, AND to the empty results tables it will fill.*",
    "",
  );

  const reasons = new Map<string, string>();
  const avoided = new Map<string, string>();
  push(
    table(
      HEADERS,
      analyses.map((row) => {
        const plan = chooseTest(row);
        if (plan) {
          reasons.set(planKey(plan), plan.why);
          if (plan.avoid) avoided.set(planKey(plan), plan.avoid);
        }
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
      }),
    ),
    "",
  );

  /* ---- the notes under the map, in the short document only ----------- */

  // The house format prints the analysis map and nothing under it. These notes
  // are what the short plan is for: the working sheet a statistician sits down
  // with, where why a test was chosen and what must not be done with it is the
  // point rather than a departure from the blueprint.
  if (short) {
    if (reasons.size) {
      push("**Why each analysis.**", "");
      for (const [test, why] of reasons) push(`- **${line(test)}:** ${plain(why)}.`);
      push("");
    }

    if (avoided.size) {
      push("**What must not be done.**", "");
      for (const [test, avoid] of avoided) push(`- **${line(test)}:** ${plain(avoid)}.`);
      push("");
    }

    const adjusted = analyses.find((a) => (a.adjust_for_ids ?? []).length > 0);
    if (spec.expected_events !== undefined && adjusted) {
      const { note } = degreesOfFreedomNote(
        spec.expected_events,
        (adjusted.adjust_for_ids ?? []).length,
      );
      push("**Degrees of freedom.**", "", plain(note), "");
    }

    const excluded = (spec.variables ?? []).filter(
      (v) => (v.role === "mediator" || v.role === "collider") && v.exclusion_reason,
    );
    if (excluded.length) {
      push("**Not adjusted for.**", "");
      for (const v of excluded) {
        push(`- ${plain(`${v.label} is a ${v.role}. ${v.exclusion_reason}`)}`);
      }
      push("", "Neither enters any model.", "");
    }
  }

  /* ---- Sections 6 and 7 -------------------------------------------- */

  if (!short) {
    push("---", "", "## Section 6 - Shell (Dummy) Tables", "");
    push(
      "Every empty results table the thesis will contain, in the order it will appear. Cells stay blank until the data arrive, and each table names the test that fills it.",
      "",
    );
    // The same tables the Word document draws. Two renderings of one plan that
    // named different tables would be two plans.
    const shells = options.shells;
    const tables = shells?.tables ?? [];
    if (shells && tables.length) {
      // Wording resolved the way the Word document resolves it, from the same
      // registry, so the two renderings name a row identically.
      const labelOf = (id: string, fallback = "") => shells.labels?.[id] ?? fallback ?? id;
      const columnOf = (id: string) => shells.columns?.[id];
      // Grouped into the four families, each under its heading and its note
      // line, as the Word document groups them. This used to print one flat
      // list, which is a third arrangement of the same tables.
      for (const block of BLOCK_ORDER) {
        const inBlock = tables
          .filter((t) => t.block === block)
          .sort((a, b) => a.number - b.number);
        if (!inBlock.length) continue;

        push(`### ${BLOCK_HEADING[block]}`, "");
        const note = blockNote(block, shells, spec);
        const label = BLOCK_NOTE_LABEL[block];
        if (note) push(label ? `**${label}:** ${line(note)}` : `*${line(note)}*`, "");

        for (const table of inBlock) {
          push(`#### Table ${table.number}.  ${line(table.title)}`, "");
          const columns = table.columns.length ? table.columns : ["Variable"];
          push(`| ${columns.map(cell).join(" | ")} |`);
          push(`| ${columns.map(() => "---").join(" | ")} |`);
          for (const name of rowLabels(table, labelOf, columnOf)) {
            push(`| ${cell(name)} |${columns.slice(1).map(() => "  |").join("")}`);
          }
          push("");
          if (table.test_applied) push(`Footnote: test used = ${line(table.test_applied)}`, "");
        }
      }
    } else {
      push(
        "The tables have not been built yet. Build them and this section fills in: the plan is written first, and the tables are laid out from it.",
        "",
      );
    }
  }

  push(
    "---",
    "",
    "*Generated from the study specification. Do not edit this document: change the specification and rebuild, or the analysis plan, the case record form and the shell tables will disagree.*",
    "",
  );

  return out.join("\n").replace(/\n{3,}/g, "\n\n");
}
