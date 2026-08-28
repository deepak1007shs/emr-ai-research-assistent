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

/**
 * The design words that give a design away, most specific first.
 *
 * Used only to notice that the prose and the classification disagree. The
 * classification is what the rules read, so a plan whose words say case-control
 * and whose field says cohort will be analysed as a cohort, and somebody should
 * be told before that happens.
 */
const DESIGN_WORDS: [RegExp, string][] = [
  [/non-?inferiority/, "non_inferiority_trial"],
  [/cross-?over/, "crossover_trial"],
  [/cluster[- ]randomi[sz]ed/, "cluster_trial"],
  [/factorial/, "factorial_trial"],
  [/case-?control/, "case_control"],
  [/cross-?sectional/, "cross_sectional"],
  [/diagnostic accuracy|sensitivity and specificity/, "diagnostic_accuracy"],
  [/systematic review|meta-?analysis/, "meta_analysis"],
  [/before[- ]and[- ]after|pre-?post|single[- ]arm/, "pre_post"],
  [/randomi[sz]ed/, "randomised_trial"],
  [/cohort/, "cohort"],
];

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

  const analysedIds = new Set(analyses.flatMap((a) => a.objective_ids ?? []));
  for (const o of objectives) {
    if (!analysedIds.has(o.id)) {
      error("MAP01", `${o.id} has no row in the analysis map, so nothing says how it will be answered.`);
    }
  }
  for (const a of analyses) {
    for (const objectiveId of a.objective_ids ?? []) {
      if (!ids.has(objectiveId)) {
        error("MAP02", `An analysis row names ${objectiveId}, which is not one of the objectives.`);
      }
    }
    if (!(a.objective_ids ?? []).length) {
      error("MAP02", `The analysis row "${a.label}" names no objective, so nothing says what it answers.`);
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
    if ((a.outcome_ids ?? []).some((id) => !byOutcome.has(id))) {
      const missing = (a.outcome_ids ?? []).filter((id) => !byOutcome.has(id));
      error(
        "REF04",
        `${(a.objective_ids ?? []).join(", ")} analyses ${missing.join(", ")}, which ${missing.length === 1 ? "is not a declared outcome" : "are not declared outcomes"}.`,
      );
    }
    for (const id of [...(a.exposure_ids ?? []), ...(a.adjust_for_ids ?? [])]) {
      if (!byVariable.has(id)) {
        error("REF05", `${(a.objective_ids ?? []).join(', ')} adjusts for ${id}, which is not a declared variable.`);
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
  // The assumptions belong to the tests actually chosen. One without the other
  // is either an unexamined test or an assumption for a test nobody runs.
  // Both halves: an adjusted model's assumptions are not the unadjusted
  // estimate's, and a plan that states one and not the other is half checked.
  const chosen = new Set(
    analyses
      .flatMap((row) => {
        const plan = chooseTest(row);
        return plan ? [plan.unadjusted, plan.adjusted] : [];
      })
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
    for (const id of [...(a.exposure_ids ?? []), ...(a.adjust_for_ids ?? [])]) {
      if (excludedIds.has(id)) {
        const v = byVariable.get(id)!;
        error(
          "ADJ01",
          `${(a.objective_ids ?? []).join(', ')} adjusts for ${v.label}, which is a ${v.role}. ${
            v.role === "mediator"
              ? "It lies on the path being measured, so adjusting for it removes the effect."
              : "It is caused by the outcome, so conditioning on it creates a spurious association."
          }`,
        );
      }
    }
    // Nor may an analysis adjust for the thing it is measuring.
    const measuredBy = new Set(
      (a.outcome_ids ?? []).flatMap((id) => byOutcome.get(id)?.source_variable_ids ?? []),
    );
    for (const id of measuredBy) {
      if (([...(a.exposure_ids ?? []), ...(a.adjust_for_ids ?? [])]).includes(id)) {
        error("ADJ04", `${(a.objective_ids ?? []).join(', ')} adjusts for ${byVariable.get(id)?.label ?? id}, which is what it is measuring.`);
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
  analyses.forEach((a) => {
    if (!chooseTest(a)) {
      error(
        "TEST01",
        `No rule covers ${(a.objective_ids ?? []).join(', ')} (${a.data_type}, ${a.comparison}). Add a row to test-rules.md, or set an override with a reason.`,
      );
    }
    // The plan chosen must actually account for how the measurements relate.
    // The rule table matched `pairing` under one comparison only, so a measure
    // repeated across three care phases and adjusted for confounders fell to
    // the ordinary regression row and was planned as though every reading came
    // from a different patient. A gap in the table is invisible; this is not.
    const plan = chooseTest(a);
    if (plan) {
      const named = [plan.unadjusted, plan.adjusted].filter(Boolean).join(" ");
      const handles =
        a.pairing === "repeated"
          ? /mixed[- ]effects|mixed model|generalised estimating|generalized estimating|\bGEE\b|repeated|Friedman|marginal mean/i
          : a.pairing === "paired"
            ? /paired|McNemar|signed[- ]rank|conditional logistic|matched|mixed[- ]effects/i
            : null;
      if (handles && !handles.test(named)) {
        error(
          "TEST03",
          `${(a.objective_ids ?? []).join(", ")} measures the same patient ${
            a.pairing === "repeated" ? "at three or more occasions" : "twice"
          }, but the analysis chosen for it is "${named}", which treats every reading as though it came from a different patient. Intervals from it are far too narrow.`,
        );
      }
    }

    if (a.test_override && !a.override_reason?.trim()) {
      error("TEST02", `${(a.objective_ids ?? []).join(', ')} overrides the standard test but gives no reason. An override that is not explained cannot be judged.`);
    }
    if (!(a.table_ids ?? []).length) {
      error("TBL01", `${(a.objective_ids ?? []).join(", ")} points at no table, so its results would have nowhere to go.`);
    } else {
      for (const tableId of a.table_ids) {
        if (seenTables.has(tableId)) {
          warn(
            "TBL02",
            `${tableId} is filled by more than one analysis. That is right where an unadjusted estimate and its adjusted model share a summary table, and a numbering slip otherwise.`,
          );
        }
        seenTables.add(tableId);
      }
    }
  });

  /* ---- events per variable ----------------------------------------- */

  // Every row that holds confounders constant, not only the first of them: a
  // secondary model can overfit while the primary one does not, and stopping
  // at the first meant a secondary model was never counted.
  for (const a of analyses) {
    const terms = [...(a.exposure_ids ?? []), ...(a.adjust_for_ids ?? [])];
    if (!(a.adjust_for_ids ?? []).length) continue;

    // Ten events per predictor is the rule for a model fitted to events. A
    // continuous outcome has no events, and its budget is the sample itself.
    const counted = a.data_type === "binary" || a.data_type === "time_to_event";
    const budget = counted ? spec.expected_events : spec.sample_size;
    const what = counted ? "expected events" : "participants";

    if (budget === undefined) {
      if (counted) {
        error(
          "ADJ05",
          `${(a.objective_ids ?? []).join(", ")} plans an adjusted model but the plan gives no expected event count, so nothing can check whether the study affords one. State the expected number of events.`,
        );
      }
      continue;
    }

    if (terms.length > Math.floor(budget / 10)) {
      warn(
        "ADJ03",
        `${(a.objective_ids ?? []).join(", ")} names ${terms.length} predictors on ${budget} ${what}. Below ten ${what} per predictor a model overfits, so the plan declares it exploratory.`,
      );
    }
  }

  /* ---- what is computed, and from what ------------------------------ */

  for (const v of variables) {
    for (const id of v.derived_from ?? []) {
      if (!byVariable.has(id)) {
        error(
          "VAR01",
          `"${v.label}" is computed from ${id}, which is not a declared variable. The form collects what a value is computed from, so an ingredient that does not exist cannot be collected.`,
        );
      }
    }
    // A variable computed from itself would send the form's field list round in
    // a circle, and the circle would be silent.
    if ((v.derived_from ?? []).includes(v.id)) {
      error("VAR02", `"${v.label}" is computed from itself.`);
    }
  }

  /* ---- how common the event is ------------------------------------- */

  // The estimate a binary outcome gets turns on this one field: stated common,
  // the plan chooses a risk ratio; left open, it falls to the rule table's
  // catch-all. The sample size calculation already assumed a rate, so the
  // arithmetic can usually settle it.
  const rate =
    spec.sample_size && spec.expected_events !== undefined
      ? spec.expected_events / spec.sample_size
      : null;

  for (const a of analyses) {
    if (a.data_type !== "binary") continue;
    if (a.comparison === "descriptive") continue;
    const stated = a.frequency && a.frequency !== "unknown" ? a.frequency : null;

    if (rate === null) {
      if (!stated) {
        error(
          "FRQ02",
          `${(a.objective_ids ?? []).join(", ")} does not say whether the event is common or rare, and the plan gives no expected event count to work it out from. Without it the plan cannot choose between a risk ratio and an odds ratio.`,
        );
      }
      continue;
    }

    const implied = rate >= 0.1 ? "common" : "rare";
    if (stated && stated !== implied) {
      warn(
        "FRQ01",
        `${(a.objective_ids ?? []).join(", ")} calls the event ${stated}, but ${spec.expected_events} events in ${spec.sample_size} is ${Math.round(rate * 100)}%, which is ${implied}. Either the row or the sample size calculation is wrong.`,
      );
    }
  }

  /* ---- the design is classified, and classified the same way -------- */

  if (!spec.design_family) {
    error(
      "STU01",
      "The design is written out but not classified, so the plan cannot tell which estimate is valid or which tables the study owes.",
    );
  } else {
    const prose = (spec.design ?? "").toLowerCase();
    const said = DESIGN_WORDS.find(([pattern]) => pattern.test(prose));
    if (said && said[1] !== spec.design_family) {
      warn(
        "STU02",
        `The design reads "${spec.design}", which is a ${said[1].replace(/_/g, " ")}, but it is classified as ${spec.design_family.replace(/_/g, " ")}. The classification is what the rules read, so the two must agree.`,
      );
    }
  }

  /* ---- every outcome is reported ----------------------------------- */

  // An outcome nobody analyses is collected on the form, printed in the
  // registry, and never reported. Objectives are already checked this way; the
  // outcomes were not.
  const analysedOutcomes = new Set(analyses.flatMap((a) => a.outcome_ids ?? []));
  for (const o of spec.outcomes ?? []) {
    if (!analysedOutcomes.has(o.id)) {
      error(
        "OUT03",
        `${o.id} ("${o.what}") is declared as an outcome but no analysis reports it, so it would be collected and never used.`,
      );
    }
  }

  return { ok: !out.some((f) => f.severity === "ERROR"), findings: out };
}
