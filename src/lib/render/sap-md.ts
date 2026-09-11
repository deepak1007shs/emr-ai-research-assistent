import { chooseTest } from "../sap/choose-test.ts";
import { PICOT_COLUMNS, PICOT_HEADING, picotRows } from "../sap/picot.ts";
import { withoutNote } from "../sap/notes.ts";
import {
  VARIABLE_LIST_COLUMNS,
  VARIABLE_LIST_HEADING,
  variableListRows,
} from "../sap/variable-list.ts";
import {
  analysisCell,
  dataTypeCell,
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
import { BLOCK_HEADING, BLOCK_ORDER } from "../tables/block-notes.ts";
import { describe as describeTable, rowLabels } from "../tables/describe.ts";
import type { ShellTablesSpec } from "../tables/types.ts";

/**
 * The Statistical Analysis Plan as Markdown.
 *
 * Mirrors sap-docx.ts section for section, so the plan can be read in a
 * terminal, pasted into an email or committed beside a protocol without
 * opening Word. `sap-md.test.ts` holds the two to the same sections, because a
 * second renderer that drifts is worse than no second renderer.
 */

const HEADERS = ["Objective", "Outcome", "Predictor(s)", "Data type", "Statistical test"];

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
  // The working sheet names them; the house format has no line for them.
  /* ---- the clinical question --------------------------------------- */

  if (spec.picot) {
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
  push("### Aim", "", plain(spec.aim), "");

  if (spec.hypothesis && !short) push("### Hypothesis", "", plain(spec.hypothesis), "");

  const tier = (name: string, want: string) => {
    const items = objectives.filter((o) => o.tier === want);
    if (!items.length) return;
    push(`### ${name}`, "");
    for (const o of items) push(`- **${line(o.id)}.** ${plain(withoutNote(o.question))}`);
    push("");
  };
  tier("Primary objective(s)", "primary");
  tier("Secondary objectives", "secondary");
  tier("Exploratory objectives", "exploratory");

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
    table(
      HEADERS,
      analyses.map((row) => {
        const plan = chooseTest(row);
        const where = tableCell(row, tableNumbers);
        return [
          withoutNote(row.label),
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

  /* ---- the master variable list -------------------------------------- */

  if (!short && (spec.variables ?? []).length) {
    push("---", "", `## ${VARIABLE_LIST_HEADING}`, "");
    push(table(VARIABLE_LIST_COLUMNS, variableListRows(spec)), "");
  }

  /* ---- Sections 6 and 7 -------------------------------------------- */

  if (!short) {
    push("---", "", "## Section 6 - Shell (Dummy) Tables", "");
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
        for (const table of inBlock) {
          push(`#### Table ${table.number}.  ${line(table.title)}`, "");
          const columns = table.columns.length ? table.columns : ["Variable"];
          push(`| ${columns.map(cell).join(" | ")} |`);
          push(`| ${columns.map(() => "---").join(" | ")} |`);
          for (const name of rowLabels(table, labelOf, columnOf)) {
            push(`| ${cell(name)} |${columns.slice(1).map(() => "  |").join("")}`);
          }
          push("");
          // The same footnote the Word file prints, from the same describer.
          // This printed `test_applied` alone, so the Markdown lost the
          // denominator, what must not be reported here, the degrees of
          // freedom and the missing-data rule - four sentences the other two
          // renderings carry.
          const said = describeTable(table, labelOf, columnOf).analysis;
          if (said) push(`Footnote: test used = ${line(said)}`, "");
        }
      }
    } else {
      push(
        "The tables have not been built yet. Build them and this section fills in: the plan is written first, and the tables are laid out from it.",
        "",
      );
    }
  }

  return out.join("\n").replace(/\n{3,}/g, "\n\n");
}
