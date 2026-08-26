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
import { line, plain } from "./plain.ts";

/**
 * The Statistical Analysis Plan as Markdown.
 *
 * Mirrors sap-docx.ts section for section, so the plan can be read in a
 * terminal, pasted into an email or committed beside a protocol without
 * opening Word. `sap-md.test.ts` holds the two to the same sections, because a
 * second renderer that drifts is worse than no second renderer.
 */

const HEADERS = ["Objective", "Outcome", "Predictor(s)", "Data type", "Statistical analysis -> Table #"];

/** A pipe inside a cell would end the column early. */
const cell = (value: string) => line(value).replace(/\|/g, "\\|");

function table(headers: string[], rows: string[][]): string {
  const head = `| ${headers.map(cell).join(" | ")} |`;
  const rule = `|${headers.map(() => "---").join("|")}|`;
  const body = rows.map((row) => `| ${row.map(cell).join(" | ")} |`);
  return [head, rule, ...body].join("\n");
}

/** The Item / Your study shape, which has no header row. */
const facts = (rows: [string, string][]) =>
  ["| | |", "|---|---|", ...rows.map(([k, v]) => `| **${cell(k)}** | ${cell(v)} |`)].join("\n");

export function buildSapMarkdown(
  spec: SapSpec,
  /** Objective id to the table that reports it, once the shell tables exist. */
  tableNumbers?: Record<string, number[]>,
  options: { variant?: SapVariant } = {},
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
  const variables = spec.variables ?? [];

  const out: string[] = [];
  const push = (...parts: string[]) => out.push(...parts);

  push("# STATISTICAL ANALYSIS PLAN", "");
  if (short) push("*Objectives, outcomes and the analysis map*", "");
  push(`**${plain(spec.title)}**`, "");
  if (spec.design || spec.setting) {
    push(`*${plain([spec.design, spec.setting].filter(Boolean).join(". "))}*`, "");
  }

  /* ---- the clinical question --------------------------------------- */

  const fw = spec.picot?.framework === "PICOT" ? "PICOT" : "PECOT";
  if (spec.picot && !short) {
    push("---", "", `## ${fw}`, "");
    push(
      "*The clinical question decomposed. This is what every objective, variable and test below must trace back to.*",
      "",
    );
    push(
      facts([
        ["P - Population", spec.picot.population],
        [fw === "PICOT" ? "I - Intervention" : "E - Exposure", spec.picot.intervention_or_exposure],
        ["C - Comparator", spec.picot.comparator],
        ["O - Outcome", spec.picot.outcome],
        ["T - Time / type of study", spec.picot.time],
      ]),
      "",
    );
    push(`**Assembled question.** ${plain(spec.picot.assembled_question)}`, "");
  }

  /* ---- Section 1 --------------------------------------------------- */

  push("---", "", section(1, "Objectives as Answerable Questions"), "");
  push(
    "*Every objective is phrased as a question, because a question forces you to name an outcome and a predictor, which is exactly what the statistics need.*",
    "",
  );
  push("### Aim", "", plain(spec.aim), "");

  if (spec.hypothesis && !short) push("### Hypothesis", "", plain(spec.hypothesis), "");

  if (spec.estimand && !short) {
    push("### Primary estimand (ICH E9(R1))", "");
    push("*The estimand, not the test, is what the study is trying to estimate.*", "");
    push(
      facts([
        ["Treatment condition", spec.estimand.treatment_condition],
        ["Population", spec.estimand.population],
        ["Endpoint", spec.estimand.endpoint],
        ["Intercurrent-event strategy", spec.estimand.intercurrent_strategy],
        ["Population-level summary", spec.estimand.summary_measure],
      ]),
      "",
    );
  }

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

  /* ---- Section 2 --------------------------------------------------- */

  const ROLE_ORDER: Record<string, number> = {
    outcome: 0, predictor: 1, effect_modifier: 2, confounder: 3,
    mediator: 4, collider: 5, descriptor: 6,
  };
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

  if (!short) {
  push("---", "", "## Section 2 - Variable Table", "");
  push(
    "*One row per variable. Once the data type and the role are set, the correct test follows almost mechanically. Grouped by role: outcomes first, then predictors, then confounders, then descriptors.*",
    "",
  );
  push(
    table(
      ["Variable", "Data type", "Unit / coding", "Role in analysis"],
      [...variables]
        .sort((a, b) => (ROLE_ORDER[a.role] ?? 9) - (ROLE_ORDER[b.role] ?? 9))
        .map((v) => [v.label, v.data_type, v.unit_coding, v.role.replace(/_/g, " ")]),
    ),
    "",
  );
  if (spec.priority_confounder_ids?.length) {
    push(
      `**Priority confounders for adjustment.** ${spec.priority_confounder_ids
        .map((id) => byVariable.get(id)?.label ?? id)
        .join(", ")}. Respecting about ten outcome events per variable.`,
      "",
    );
  }

  /* ---- Section 3 --------------------------------------------------- */

  }

  push("---", "", section(3, "Analysis Map"), "");
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

  const measured = (spec.outcomes ?? []).filter((o) =>
    analyses.some((a) => (a.outcome_ids ?? []).includes(o.id)),
  );
  if (measured.length && !short) {
    push("**How each outcome is defined.**", "");
    for (const o of measured) push(`- **${plain(o.what)}.** ${plain(outcomeDefinition(o))}`);
    push("");
  }

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

  const excluded = variables.filter(
    (v) => (v.role === "mediator" || v.role === "collider") && v.exclusion_reason,
  );
  if (excluded.length) {
    push("**Not adjusted for.**", "");
    for (const v of excluded) push(`- ${plain(`${v.label} is a ${v.role}. ${v.exclusion_reason}`)}`);
    push("", "Neither enters any model.", "");
  }

  /* ---- Section 4 --------------------------------------------------- */

  if (spec.rules && !short) {
    push("---", "", "## Section 4 - General Statistical Rules", "");
    push("*Fixed upfront so they are never re-decided after seeing the data.*", "");
    for (const [label, value] of [
      ["Software", spec.rules.software],
      ["Normality", spec.rules.normality],
      ["Continuous data", spec.rules.continuous_summary],
      ["Categorical data", spec.rules.categorical_summary],
      ["Significance", spec.rules.significance],
      ["Effect estimates", spec.rules.effect_estimates],
      ["Missing data", spec.rules.missing_data],
      ["Multiplicity", spec.rules.multiplicity],
      ["Reproducibility", spec.rules.reproducibility],
    ] as [string, string][]) {
      push(`- **${label}.** ${plain(value)}`);
    }
    push("");
  }
  if (spec.sample_size_note && !short) {
    push(`**Sample size.** ${plain(spec.sample_size_note)}`, "");
  }

  if (spec.populations?.length && !short) {
    push("### Analysis populations (who is analysed)", "");
    push(table(["Population", "Definition"], spec.populations.map((p) => [p.name, p.definition])), "");
  }
  if (spec.baseline_comparison && !short) {
    push("### Baseline comparison", "", plain(spec.baseline_comparison), "");
  }
  if (spec.intercurrent_events?.length && !short) {
    push("### Intercurrent events", "");
    push(
      "*These change what is being estimated. Missing data is a separate problem, handled by the rule above.*",
      "",
    );
    push(table(["Event", "Strategy"], spec.intercurrent_events.map((e) => [e.event, e.strategy])), "");
  }
  if (spec.testing_hierarchy && !short) {
    push("### Multiplicity and testing hierarchy", "", plain(spec.testing_hierarchy), "");
  }
  if (spec.subgroups?.length && !short) {
    push("### Subgroup and interaction analyses", "");
    push(
      "*Pre-specified. Effect modification is tested by an interaction term, never by comparing within-subgroup p values.*",
      "",
    );
    push(table(["Subgroup", "How it is tested"], spec.subgroups.map((g) => [g.subgroup, g.how_tested])), "");
  }
  if (spec.interim && !short) {
    push("### Interim analyses and stopping rules", "", plain(spec.interim), "");
  }

  /* ---- Section 5 and 5A -------------------------------------------- */

  if (spec.steps?.length && !short) {
    push("---", "", "## Section 5 - Step-by-Step Analysis Flow", "");
    push("*The ladder for the primary objective. The same ladder works for almost any design.*", "");
    for (const step of spec.steps) push(`- **${line(step.step)}.** ${plain(step.what)}`);
    push("");
  }

  if (spec.assumption_checks?.length && !short) {
    push("---", "", "## Section 5A - Assumption Checking", "");
    push(
      "*The assumptions belong to the test that was chosen, so only the assumptions the planned tests actually make are listed.*",
      "",
    );
    const byTest = new Map<string, typeof spec.assumption_checks>();
    for (const check of spec.assumption_checks) {
      byTest.set(check.test, [...(byTest.get(check.test) ?? []), check]);
    }
    for (const [test, checks] of byTest) {
      push(`### ${line(test)}`, "");
      push(
        table(
          ["Assumption", "How it will be checked", "If violated", "Clinical example"],
          checks.map((c) => [c.assumption, c.how_checked, c.if_violated, c.example]),
        ),
        "",
      );
    }
  }

  /* ---- Sections 6 and 7 -------------------------------------------- */

  if (!short) {
    push("---", "", "## Section 6 - Shell (Dummy) Tables", "");
    push(
      "Every empty results table the thesis will contain, in the order it will appear, is laid out in the Shell Tables document that accompanies this plan. Cells stay blank until the data arrive, and each table names the test that produced it.",
      "",
    );
  }

  push(
    "---",
    "",
    "*Generated from the study specification. Do not edit this document: change the specification and rebuild, or the analysis plan, the case record form and the shell tables will disagree.*",
    "",
  );

  return out.join("\n").replace(/\n{3,}/g, "\n\n");
}
