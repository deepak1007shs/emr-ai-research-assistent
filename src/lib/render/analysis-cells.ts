import type { AnalysisPlan } from "../sap/choose-test.ts";
import type { AnalysisRow, Variable } from "../sap/types.ts";

/**
 * The four cells of an analysis-map row that need judgement to write.
 *
 * Shared by the Word renderer, the Markdown one and the preview, so the map
 * cannot say three different things about the same analysis.
 */

/** The key a plan is remembered under, for the notes below the map. */
export function planKey(plan: AnalysisPlan): string {
  return plan.unadjusted ?? plan.adjusted ?? plan.why;
}

/**
 * The exposure and the confounders, kept apart.
 *
 * A flat list of "predictors" hid which was being compared and which was being
 * held constant, and those are not the same thing.
 */
export function predictorCell(row: AnalysisRow, byVariable: Map<string, Variable>): string {
  const name = (id: string) => byVariable.get(id)?.label ?? id;
  const exposure = (row.exposure_ids ?? []).map(name).join(", ");
  const adjust = (row.adjust_for_ids ?? []).map(name).join(", ");

  if (!exposure && !adjust) return "None (single-group estimation)";
  if (!adjust) return exposure;
  if (!exposure) return `Adjust for ${adjust}`;
  return `${exposure}; adjust for ${adjust}`;
}

/**
 * The data type, with the riders that change what may be reported.
 *
 * A common binary outcome is the one that matters most: an odds ratio read as
 * a risk ratio overstates the effect, and saying so in the cell is what stops
 * it happening.
 */
export function dataTypeCell(row: AnalysisRow): string {
  const parts: string[] = [row.data_type];
  if (row.pairing === "repeated") parts.push("repeated measures");
  else if (row.pairing === "paired") parts.push("paired");
  if (row.skewed) parts.push("skewed");
  if (row.data_type === "binary" && row.frequency === "common") {
    parts.push("common outcome, so a RISK RATIO and RISK DIFFERENCE, not an odds ratio");
  }
  if (row.data_type === "binary" && row.frequency === "rare") parts.push("rare outcome");
  return parts.join(", ");
}

/**
 * The whole plan in one cell: the unadjusted estimate, then the adjusted model
 * or the reason there is none.
 *
 * "Adjusted: not planned in a pilot, it would need ten events per variable" is
 * a decision. A blank is not.
 */
export function analysisCell(plan: AnalysisPlan, row: AnalysisRow): string {
  if (plan.overridden) return plan.unadjusted ?? plan.why;

  const parts: string[] = [
    plan.unadjusted ? `Unadjusted: ${plan.unadjusted}` : "Unadjusted: not applicable",
  ];

  if (row.no_adjustment_reason) {
    parts.push(`Adjusted: not planned - ${row.no_adjustment_reason}`);
  } else if (plan.adjusted && (row.adjust_for_ids ?? []).length) {
    parts.push(`Adjusted: ${plan.adjusted}`);
  } else if (plan.adjusted) {
    parts.push("Adjusted: not planned, because no confounders are named");
  } else {
    parts.push("Adjusted: not applicable to this question");
  }

  return parts.join(". ");
}

/**
 * Where the row's results go.
 *
 * The plan writes provisional table ids before it knows how many baseline
 * tables the study needs. Once the shell tables exist they own the numbering
 * and say which objectives each of their tables answers, so the real numbers
 * are looked up by objective rather than by the plan's own id.
 */
export function tableCell(row: AnalysisRow, tableNumbers?: Record<string, number[]>): string {
  const real = [
    ...new Set((row.objective_ids ?? []).flatMap((id) => tableNumbers?.[id] ?? [])),
  ].sort((a, b) => a - b);

  if (real.length) return real.map((n) => `Table ${n}`).join(", ");
  return (row.table_ids ?? []).join(", ") || "no table";
}
