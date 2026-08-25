import { createRequire } from "node:module";
import type { StudySpec } from "./types.ts";

/**
 * Runs the gate against a specification, now.
 *
 * The findings stored beside a spec are a record of what the gate said when it
 * was drafted, not the truth. The gate is pure and fast, so it is re-run on
 * every read: otherwise every improvement to a guard fails to reach specs that
 * already exist, and a corrected rule leaves old errors frozen in the database
 * blocking documents forever.
 */

const require = createRequire(import.meta.url);

/**
 * Effect measures written as prose before the schema constrained them. The
 * guards compare against a token and a table column is built from one, so a
 * stored spec is canonicalised on read exactly as the gate is re-run on read.
 */
const EFFECT_MEASURES: [RegExp, string][] = [
  [/hazard\s*ratio/i, "hazard_ratio"],
  [/kappa|agreement/i, "agreement"],
  [/risk\s*difference/i, "risk_difference"],
  [/relative\s*risk|risk\s*ratio/i, "risk_ratio"],
  [/rate\s*ratio/i, "rate_ratio"],
  [/odds\s*ratio/i, "odds_ratio"],
  [/median\s*difference|hodges/i, "median_difference"],
  [/mean\s*difference/i, "mean_difference"],
  [/sensitivity|specificity/i, "sensitivity_specificity"],
  [/correlation/i, "correlation"],
  [/proportion|frequency|percentage/i, "proportion"],
];

const TOKENS = new Set(EFFECT_MEASURES.map(([, token]) => token));

/**
 * Applies the deterministic clean-ups a stored specification may predate.
 * Never invents content: it only rewrites a value into the form the rest of the
 * system expects.
 */
export function normaliseStoredSpec<T>(spec: T): T {
  const s = spec as unknown as { analyses?: { effect_measure?: string }[] };
  if (!s || !Array.isArray(s.analyses)) return spec;

  for (const analysis of s.analyses) {
    const raw = analysis.effect_measure;
    if (!raw || TOKENS.has(raw)) continue;
    for (const [pattern, token] of EFFECT_MEASURES) {
      if (pattern.test(raw)) {
        analysis.effect_measure = token;
        break;
      }
    }
  }
  return spec;
}

export type Finding = {
  code: string;
  severity: "ERROR" | "WARN";
  path: string;
  message: string;
};

type Validator = {
  validate: (spec: unknown, options?: { final?: boolean }) => {
    ok: boolean;
    findings: Finding[];
  };
};

export function gateSpec(
  spec: StudySpec | unknown,
  options: { final?: boolean } = {},
): { ok: boolean; findings: Finding[]; errors: Finding[]; warnings: Finding[] } {
  const { validate } = require("./validate_study_spec.js") as Validator;
  const { ok, findings } = validate(normaliseStoredSpec(spec), options);
  return {
    ok,
    findings,
    errors: findings.filter((f) => f.severity === "ERROR"),
    warnings: findings.filter((f) => f.severity === "WARN"),
  };
}
