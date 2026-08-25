import type { ShellTablesSpec } from "./types.ts";
import type { SapSpec } from "../sap/types.ts";
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
  sap?: SapSpec,
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
    const numbers = new Set(tables.map((t) => `T${t.number}`));
    for (const analysis of sap.analyses ?? []) {
      if (analysis.table_ref && !numbers.has(analysis.table_ref)) {
        error(
          "TBL14",
          `The analysis plan sends ${analysis.objective_id} to ${analysis.table_ref}, but there is no such table, so that analysis would never be reported.`,
        );
      }
    }

    const referenced = new Set((sap.analyses ?? []).map((a) => a.table_ref));
    for (const t of tables) {
      if (t.block !== "descriptive" && !referenced.has(`T${t.number}`)) {
        warn(
          "TBL15",
          `Table ${t.number} is not filled by any analysis in the plan. Either an analysis is missing, or the table is.`,
        );
      }
    }
  }

  return { ok: !out.some((f) => f.severity === "ERROR"), findings: out };
}
