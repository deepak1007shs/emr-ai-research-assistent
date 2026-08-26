import type { ShellTablesSpec } from "./types.ts";
import type { SapRegistry } from "../sap/types.ts";
import { outcomeIndex, variableIndex } from "../sap/types.ts";
import type { Finding } from "../sap/validate.ts";

/**
 * Checks the shell tables against the analysis plan they report.
 *
 * The plan already says which table each analysis fills. These guards make that
 * a fact rather than an intention: an analysis with no table would never be
 * reported, and a table no analysis fills would never be filled.
 */

const CI = /95%\s*ci/i;
const EFFECT = /\b(or|rr|hr|odds ratio|risk ratio|hazard ratio|difference|mean difference)\b/i;

export function validateTables(
  spec: ShellTablesSpec,
  sap?: SapRegistry,
): { ok: boolean; findings: Finding[] } {
  const out: Finding[] = [];
  const error = (code: string, message: string) => out.push({ code, severity: "ERROR", message });
  const warn = (code: string, message: string) => out.push({ code, severity: "WARN", message });

  const tables = [...(spec.tables ?? [])].sort((a, b) => a.number - b.number);

  if (!tables.length) {
    error("TBL00", "There are no tables.");
    return { ok: false, findings: out };
  }

  /* ---- numbering and block order ----------------------------------- */

  tables.forEach((t, i) => {
    if (t.number !== i + 1) {
      error("TBL01", `Table ${t.number} is in position ${i + 1}. Number them contiguously from 1.`);
    }
  });

  const order = ["descriptive", "primary", "secondary", "exploratory"];
  let seen = -1;
  for (const t of tables) {
    const rank = order.indexOf(t.block);
    if (rank < seen) {
      error(
        "TBL02",
        `Table ${t.number} is ${t.block}, but a later block has already begun. Order them descriptive, primary, secondary, exploratory.`,
      );
      break;
    }
    seen = Math.max(seen, rank);
  }

  if (!tables.some((t) => t.block === "descriptive")) {
    error("TBL03", "There is no baseline table. Every study reports who was in it before reporting what happened to them.");
  }
  if (!tables.some((t) => t.block === "primary")) {
    error("TBL04", "There is no table for the primary outcome.");
  }

  /* ---- each table -------------------------------------------------- */

  for (const t of tables) {
    if (t.columns.length < 2) {
      error("TBL05", `Table ${t.number} has fewer than two columns.`);
    }
    if (!t.rows.length) {
      error("TBL06", `Table ${t.number} has no rows.`);
    }
    if (t.rows.every((r) => r.heading)) {
      error("TBL07", `Table ${t.number} has only headings and no rows to fill.`);
    }
    if (!/\(n\s*=/.test(t.title)) {
      warn("TBL08", `Table ${t.number} does not carry its denominator. A table without "(n = ...)" cannot be read alone.`);
    }

    const analytical = t.kind === "comparative" || t.kind === "effect" || t.kind === "accuracy";
    if (analytical && !t.test_applied) {
      error("TBL09", `Table ${t.number} reports a comparison but does not name the test applied.`);
    }
    if (t.kind === "descriptive" && t.test_applied === undefined && /p[- ]?value/i.test(t.columns.join(" "))) {
      warn("TBL10", `Table ${t.number} has a p-value column but names no test.`);
    }

    for (const column of t.columns) {
      if (/^model\s*\d/i.test(column.trim())) {
        error("TBL11", `Table ${t.number} has a column called "${column}". Name what the model estimates, not its number.`);
      }
      if (EFFECT.test(column) && !CI.test(column) && !/p[- ]?value/i.test(column)) {
        error(
          "TBL12",
          `Table ${t.number} reports "${column}" without a 95% CI. An effect size without an interval says nothing about precision.`,
        );
      }
    }

    if (t.kind === "effect") {
      const joined = t.columns.join(" ").toLowerCase();
      if (joined.includes("adjusted") && !joined.includes("unadjusted")) {
        error(
          "TBL13",
          `Table ${t.number} reports an adjusted effect with no unadjusted column beside it. A reader cannot see what the adjustment did.`,
        );
      }
    }
  }

  /* ---- against the analysis plan ------------------------------------ */

  if (sap) {
    const byVariable = variableIndex(sap);
    const byOutcome = outcomeIndex(sap);
    const nameOf = (id: string) =>
      byVariable.get(id)?.label ?? byOutcome.get(id)?.what ?? spec.labels?.[id] ?? id;

    // The tables document owns the numbering, and says which analyses each of
    // its tables answers. The plan's own table_id was assigned before anyone
    // knew how many baseline tables the study needed, so it is not checked
    // against a number: it is checked against this.
    const analysisOf = new Map((sap.analyses ?? []).map((a) => [a.objective_id, a]));
    const byObjective = new Map<string, (typeof tables)[number]>();
    for (const t of tables) {
      for (const objectiveId of t.fills ?? []) {
        if (byObjective.has(objectiveId)) {
          error(
            "TBL19",
            `${objectiveId} is reported by both Table ${byObjective.get(objectiveId)!.number} and Table ${t.number}. One analysis, one table.`,
          );
        } else {
          byObjective.set(objectiveId, t);
        }
      }
    }

    for (const analysis of sap.analyses ?? []) {
      if (!byObjective.has(analysis.objective_id)) {
        error(
          "TBL14",
          `No table reports ${analysis.objective_id}, so that analysis would never be reported.`,
        );
      }
    }

    for (const t of tables) {
      const filled = (t.fills ?? [])
        .map((id) => analysisOf.get(id))
        .filter((a): a is NonNullable<typeof a> => Boolean(a));
      if (t.block !== "descriptive" && !filled.length) {
        warn(
          "TBL15",
          `Table ${t.number} reports no analysis in the plan. Either an analysis is missing, or the table is.`,
        );
      }

      // Every row that claims a variable must claim one the plan declared.
      for (const row of t.rows) {
        if (row.variable_id && !byVariable.has(row.variable_id)) {
          error(
            "REF08",
            `Table ${t.number} has a row for ${row.variable_id}, which the analysis plan does not declare.`,
          );
        }
      }

      if (t.outcome_id && !byOutcome.has(t.outcome_id)) {
        error(
          "REF09",
          `Table ${t.number} reports ${t.outcome_id}, which is not an outcome in the analysis plan.`,
        );
      }

      // The table and the analyses it reports must be about the same outcome.
      if (t.outcome_id) {
        for (const a of filled) {
          if (a.outcome_id !== t.outcome_id) {
            error(
              "TBL16",
              `Table ${t.number} reports "${nameOf(t.outcome_id)}", but ${a.objective_id}, which it says it fills, measures "${nameOf(a.outcome_id)}".`,
            );
          }
        }
      }

      // An adjusted column must adjust for what the plan said it would.
      if (t.adjusted_for?.length) {
        for (const id of t.adjusted_for) {
          const variable = byVariable.get(id);
          if (!variable) {
            error(
              "REF10",
              `Table ${t.number} adjusts for ${id}, which the analysis plan does not declare.`,
            );
            continue;
          }
          if (variable.role === "mediator" || variable.role === "collider") {
            error(
              "TBL17",
              `Table ${t.number} adjusts for "${variable.label}", which is a ${variable.role}. Adjusting for it removes part of the effect the study is trying to measure.`,
            );
          }
        }
        const planned = new Set(filled.flatMap((a) => a.predictor_ids ?? []));
        const extra = filled.length ? t.adjusted_for.filter((id) => !planned.has(id)) : [];
        if (extra.length) {
          warn(
            "TBL18",
            `Table ${t.number} adjusts for ${extra.map(nameOf).join(", ")}, which ${filled
              .map((a) => a.objective_id)
              .join(" or ")} does not list as a predictor. Either the plan or the table is out of date.`,
          );
        }
      }
    }
  }

  return { ok: !out.some((f) => f.severity === "ERROR"), findings: out };
}
