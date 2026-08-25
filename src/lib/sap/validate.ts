import type { SapSpec } from "./types.ts";
import { chooseTest } from "./choose-test.ts";

/**
 * The guards on an analysis model.
 *
 * Far fewer than a full study specification needs, because this object is small.
 * Each one exists because breaking it makes a plan wrong rather than merely thin.
 */

export type Finding = {
  code: string;
  severity: "ERROR" | "WARN";
  message: string;
};

const WORDS_THAT_ARE_NOT_MEASURABLE = /\b(study|evaluate|assess|understand|know|look at)\b/i;
const WORDS_THAT_CLAIM_CAUSE = /\b(leading to|causes?|caused by|due to|effect of|impact of)\b/i;

export function validateSap(spec: SapSpec): { ok: boolean; findings: Finding[] } {
  const out: Finding[] = [];
  const error = (code: string, message: string) =>
    out.push({ code, severity: "ERROR", message });
  const warn = (code: string, message: string) =>
    out.push({ code, severity: "WARN", message });

  const objectives = spec.objectives ?? [];
  const analyses = spec.analyses ?? [];
  const variables = spec.variables ?? [];

  /* ---- objectives -------------------------------------------------- */

  const primary = objectives.filter((o) => o.tier === "primary");
  if (primary.length !== 1) {
    error(
      "OBJ01",
      primary.length === 0
        ? "No primary objective. Exactly one objective must be the question the study is built around."
        : `${primary.length} primary objectives (${primary.map((o) => o.id).join(", ")}). Exactly one is allowed; demote the rest to secondary.`,
    );
  }

  const ids = new Set<string>();
  for (const o of objectives) {
    if (ids.has(o.id)) error("OBJ02", `The id ${o.id} is used twice. Number them P1, S1, S2 and so on.`);
    ids.add(o.id);

    if (WORDS_THAT_ARE_NOT_MEASURABLE.test(o.question)) {
      warn(
        "OBJ03",
        `${o.id} still contains a word that cannot be measured ("${o.question.match(WORDS_THAT_ARE_NOT_MEASURABLE)?.[0]}"). Replace it with estimate, compare or determine.`,
      );
    }
    if (WORDS_THAT_CLAIM_CAUSE.test(o.question)) {
      warn(
        "OBJ04",
        `${o.id} claims causation ("${o.question.match(WORDS_THAT_CLAIM_CAUSE)?.[0]}"), which an observational design cannot support. Use "associated with".`,
      );
    }
  }

  /* ---- every objective has a row, every row an objective ------------ */

  const analysedIds = new Set(analyses.map((a) => a.objective_id));
  for (const o of objectives) {
    if (!analysedIds.has(o.id)) {
      error("MAP01", `${o.id} has no row in the analysis map, so nothing says how it will be answered.`);
    }
  }
  for (const a of analyses) {
    if (!ids.has(a.objective_id)) {
      error("MAP02", `An analysis row names ${a.objective_id}, which is not one of the objectives.`);
    }
  }

  /* ---- the five questions ------------------------------------------ */

  for (const a of analyses) {
    const missing = (["what", "how", "instrument", "when", "units"] as const).filter(
      (key) => !a.outcome?.[key]?.trim(),
    );
    if (missing.length) {
      error(
        "OUT01",
        `The outcome for ${a.objective_id} does not say: ${missing.join(", ")}. An outcome is not defined until all five questions are answered.`,
      );
    }
    if (!a.outcome?.domain) {
      error("OUT02", `The outcome for ${a.objective_id} has no domain. Classify it clinical, laboratory, radiological, functional, patient-reported, economic or composite.`);
    }
  }

  /* ---- adjustment integrity ---------------------------------------- */

  const excluded = variables.filter((v) => v.role === "mediator" || v.role === "collider");
  for (const a of analyses) {
    const named = a.predictors.toLowerCase();
    for (const v of excluded) {
      if (named.includes(v.name.toLowerCase())) {
        error(
          "ADJ01",
          `${a.objective_id} adjusts for ${v.name}, which is a ${v.role}. ${
            v.role === "mediator"
              ? "It lies on the path being measured, so adjusting for it removes the effect."
              : "It is caused by the outcome, so conditioning on it creates a spurious association."
          }`,
        );
      }
    }
  }
  for (const v of excluded) {
    if (!v.exclusion_reason?.trim()) {
      warn("ADJ02", `${v.name} is named a ${v.role} but does not say why it is excluded. The reason prints in the plan.`);
    }
  }

  /* ---- tests and tables -------------------------------------------- */

  const seenTables = new Set<string>();
  analyses.forEach((a, i) => {
    if (!chooseTest(a)) {
      error(
        "TEST01",
        `No rule covers ${a.objective_id} (${a.data_type}, ${a.comparison}). Add a row to test-rules.md, or set an override with a reason.`,
      );
    }
    if (a.test_override && !a.override_reason?.trim()) {
      error("TEST02", `${a.objective_id} overrides the standard test but gives no reason. An override that is not explained cannot be judged.`);
    }
    if (!a.table_ref) {
      error("TBL01", `${a.objective_id} points at no table.`);
    } else {
      if (seenTables.has(a.table_ref)) {
        warn("TBL02", `${a.table_ref} is used by more than one row. Two analyses sharing a table is usually a numbering slip.`);
      }
      seenTables.add(a.table_ref);
      if (a.table_ref !== `T${i + 1}`) {
        warn("TBL03", `${a.objective_id} points at ${a.table_ref}, but it is row ${i + 1}. Number the tables in the order the rows appear.`);
      }
    }
  });

  /* ---- events per variable ----------------------------------------- */

  const adjusted = analyses.find((a) => a.comparison === "adjusted");
  if (adjusted && spec.expected_events !== undefined) {
    const count = adjusted.predictors.split(",").filter((p) => p.trim()).length;
    if (count > Math.floor(spec.expected_events / 10)) {
      warn(
        "ADJ03",
        `The adjusted model names ${count} predictors on ${spec.expected_events} expected events. Below ten events per predictor a model overfits, so the plan declares it exploratory.`,
      );
    }
  }

  return { ok: !out.some((f) => f.severity === "ERROR"), findings: out };
}
