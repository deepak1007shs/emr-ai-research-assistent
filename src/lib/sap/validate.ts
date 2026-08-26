import type { SapSpec } from "./types.ts";
import { outcomeIndex, variableIndex } from "./types.ts";
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

  /* ---- referential integrity: every id resolves --------------------- */

  const byVariable = variableIndex(spec);
  const byOutcome = outcomeIndex(spec);

  const variableIds = new Set<string>();
  for (const v of variables) {
    if (variableIds.has(v.id)) error("REF01", `The variable id ${v.id} is used twice.`);
    variableIds.add(v.id);
  }

  const outcomeIds = new Set<string>();
  for (const o of spec.outcomes ?? []) {
    if (outcomeIds.has(o.id)) error("REF02", `The outcome id ${o.id} is used twice.`);
    outcomeIds.add(o.id);
  }

  // One concept, one wording. Two labels the same means one concept has two
  // identities, which is how documents start disagreeing.
  const labels = new Map<string, string>();
  for (const v of variables) {
    const key = v.label.trim().toLowerCase();
    const first = labels.get(key);
    if (first) error("REF03", `${first} and ${v.id} are both labelled "${v.label}". One concept has one wording.`);
    else labels.set(key, v.id);
  }

  // The form and the tables resolve variables and outcomes through one map, so
  // an id used by both would silently overwrite one of them.
  for (const o of spec.outcomes ?? []) {
    if (variableIds.has(o.id)) {
      error("REF11", `${o.id} is the id of both a variable and an outcome. An id names one thing.`);
    }
  }

  // One concept, one wording, for outcomes too.
  const outcomeLabels = new Map<string, string>();
  for (const o of spec.outcomes ?? []) {
    const key = o.what?.trim().toLowerCase();
    if (!key) continue;
    const first = outcomeLabels.get(key);
    if (first) {
      error("REF12", `${first} and ${o.id} both measure "${o.what}". Two outcomes with one wording are one outcome.`);
    } else outcomeLabels.set(key, o.id);
  }

  for (const a of analyses) {
    if (!byOutcome.has(a.outcome_id)) {
      error("REF04", `${a.objective_id} analyses ${a.outcome_id}, which is not a declared outcome.`);
    }
    for (const id of a.predictor_ids ?? []) {
      if (!byVariable.has(id)) {
        error("REF05", `${a.objective_id} adjusts for ${id}, which is not a declared variable.`);
      }
    }
  }

  for (const o of spec.outcomes ?? []) {
    for (const id of o.source_variable_ids ?? []) {
      if (!byVariable.has(id)) {
        error("REF06", `Outcome ${o.id} is measured by ${id}, which is not a declared variable.`);
      }
    }
  }

  /* ---- the route map is complete ------------------------------------ */

  // A section left blank reads as a section nobody thought about, which is
  // exactly what a supervisor is checking for.
  const required: [string, string, string][] = [
    ["MAP01", spec.glance?.primary_outcome, "Section 0 does not name a primary outcome."],
    ["MAP02", spec.glance?.sample_size_basis, "Section 0 gives no basis for the sample size."],
    ["MAP03", spec.picot?.assembled_question, "The clinical question has not been assembled into one sentence."],
    ["MAP04", spec.estimand?.endpoint, "The primary estimand does not name its endpoint."],
    ["MAP05", spec.estimand?.intercurrent_strategy, "The primary estimand does not say how intercurrent events are handled."],
    ["MAP06", spec.rules?.missing_data, "No missing-data method is stated. Chosen after seeing the data, it is not a method."],
    ["MAP07", spec.rules?.multiplicity, "No multiplicity rule is stated."],
    ["MAP08", spec.interim, "Interim analyses are not mentioned. Where there are none, say so."],
    ["MAP09", spec.baseline_comparison, "Section 4 does not say how baseline balance is reported."],
    ["MAP10", spec.testing_hierarchy, "No testing hierarchy is stated, so the order of testing is not fixed."],
  ];
  for (const [code, value, message] of required) {
    if (!value?.trim()) error(code, message);
  }

  if (!spec.populations?.length) {
    error("MAP11", "No analysis population is defined, so it is not stated who is analysed.");
  }
  if (!spec.steps?.length) {
    error("MAP12", "Section 5 has no steps, so the plan says what to run but not in what order.");
  }
  if (!spec.flags?.length) {
    warn(
      "MAP13",
      "Nothing is flagged as still open. A protocol with no open decisions is unusual; check that the list is empty because it was considered.",
    );
  }

  // The assumptions belong to the tests actually chosen. One without the other
  // is either an unexamined test or an assumption for a test nobody runs.
  const chosen = new Set(
    analyses
      .map((row) => row.test_override?.trim() || chooseTest(row)?.test)
      .filter((t): t is string => Boolean(t)),
  );
  const checked = new Set((spec.assumption_checks ?? []).map((c) => c.test));
  for (const test of chosen) {
    if (!checked.has(test)) {
      warn("MAP14", `No assumption is stated for "${test}", which the plan chooses.`);
    }
  }
  for (const test of checked) {
    if (!chosen.has(test)) {
      warn("MAP15", `Assumptions are stated for "${test}", which this study does not run.`);
    }
  }

  // Adjustment can only use what is declared, and never a mediator or collider.
  for (const id of spec.priority_confounder_ids ?? []) {
    const variable = byVariable.get(id);
    if (!variable) {
      error("MAP16", `${id} is named as a priority confounder but is not a declared variable.`);
      continue;
    }
    if (variable.role === "mediator" || variable.role === "collider") {
      error(
        "MAP17",
        `"${variable.label}" is named as a priority confounder but is a ${variable.role}, so adjusting for it would remove part of the effect being measured.`,
      );
    }
  }

  /* ---- the five questions ------------------------------------------ */

  for (const o of spec.outcomes ?? []) {
    const missing = (["what", "how", "instrument", "when", "units"] as const).filter(
      (key) => !o[key]?.trim(),
    );
    if (missing.length) {
      error(
        "OUT01",
        `Outcome ${o.id} does not say: ${missing.join(", ")}. An outcome is not defined until all five questions are answered.`,
      );
    }
    if (!o.domain) {
      error("OUT02", `Outcome ${o.id} has no domain. Classify it clinical, laboratory, radiological, functional, patient-reported, economic or composite.`);
    }
  }

  /* ---- adjustment integrity ---------------------------------------- */

  // Caught by id, so a mediator cannot slip through on a spelling difference.
  const excluded = variables.filter((v) => v.role === "mediator" || v.role === "collider");
  const excludedIds = new Set(excluded.map((v) => v.id));

  for (const a of analyses) {
    for (const id of a.predictor_ids ?? []) {
      if (excludedIds.has(id)) {
        const v = byVariable.get(id)!;
        error(
          "ADJ01",
          `${a.objective_id} adjusts for ${v.label}, which is a ${v.role}. ${
            v.role === "mediator"
              ? "It lies on the path being measured, so adjusting for it removes the effect."
              : "It is caused by the outcome, so conditioning on it creates a spurious association."
          }`,
        );
      }
    }
    // Nor may an analysis adjust for the thing it is measuring.
    const outcome = byOutcome.get(a.outcome_id);
    for (const id of outcome?.source_variable_ids ?? []) {
      if ((a.predictor_ids ?? []).includes(id)) {
        error("ADJ04", `${a.objective_id} adjusts for ${byVariable.get(id)?.label ?? id}, which is what it is measuring.`);
      }
    }
  }

  for (const v of excluded) {
    if (!v.exclusion_reason?.trim()) {
      warn("ADJ02", `${v.label} is named a ${v.role} but does not say why it is excluded. The reason prints in the plan.`);
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
    if (!a.table_id) {
      error("TBL01", `${a.objective_id} points at no table.`);
    } else {
      if (seenTables.has(a.table_id)) {
        warn("TBL02", `${a.table_id} is used by more than one row. Two analyses sharing a table is usually a numbering slip.`);
      }
      seenTables.add(a.table_id);
      if (a.table_id !== `T${i + 1}`) {
        warn("TBL03", `${a.objective_id} points at ${a.table_id}, but it is row ${i + 1}. Number the tables in the order the rows appear.`);
      }
    }
  });

  /* ---- events per variable ----------------------------------------- */

  const adjusted = analyses.find((a) => a.comparison === "adjusted");
  if (adjusted && spec.expected_events !== undefined) {
    const count = (adjusted.predictor_ids ?? []).length;
    if (count > Math.floor(spec.expected_events / 10)) {
      warn(
        "ADJ03",
        `The adjusted model names ${count} predictors on ${spec.expected_events} expected events. Below ten events per predictor a model overfits, so the plan declares it exploratory.`,
      );
    }
  }

  return { ok: !out.some((f) => f.severity === "ERROR"), findings: out };
}
