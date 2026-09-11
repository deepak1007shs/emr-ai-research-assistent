import type {
  AnalysisRow,
  CheckResult,
  FactsSheet,
  Objective,
  Variable,
} from "../study/types.ts";

/**
 * The five checks Step 4 owes.
 *
 * Three block and two warn. The two that warn are the ones whose answer depends
 * on a number the protocol may not have given yet: how many values each
 * participant contributes, and whether the sample can carry the adjustment.
 * A warning is right there, because the work can continue while the
 * investigator answers.
 */

const ok = (id: string, message: string): CheckResult => ({
  id,
  pass: true,
  failing: [],
  message,
});

/** Ratios that must never be reported for an outcome that is common. */
const ODDS = /odds ratio/i;

export function step4Checks(
  facts: FactsSheet,
  objectives: Objective[],
  rows: AnalysisRow[],
  variables: Variable[] = [],
): CheckResult[] {
  const results: CheckResult[] = [];
  const mapped = new Set(rows.map((r) => r.objective));

  /* S4-1: nothing the plan promised is missing from the map. */
  const unmapped = objectives.filter(
    (o) => o.family !== "exploratory" && !mapped.has(o.id),
  );
  results.push(
    unmapped.length === 0
      ? ok("S4-1", "Every primary and secondary objective has a row in the map, and so will have a table.")
      : {
          id: "S4-1",
          pass: false,
          failing: unmapped.map((o) => o.id),
          message: `${unmapped.map((o) => o.id).join(", ")} ${unmapped.length === 1 ? "is an objective" : "are objectives"} with no analysis. The question is asked in Section 1 and answered nowhere.`,
        },
  );

  /* S4-2: unadjusted and adjusted, or a stated reason for one of them. */
  const halfPlanned = rows.filter(
    (r) =>
      r.objective[0] !== "E" &&
      !r.exception &&
      (!r.unadjusted || !r.adjusted),
  );
  results.push(
    halfPlanned.length === 0
      ? ok("S4-2", "Every outcome has an unadjusted and an adjusted entry, or a written exception.")
      : {
          id: "S4-2",
          pass: false,
          failing: halfPlanned.map((r) => r.objective),
          message: `${halfPlanned.map((r) => r.objective).join(", ")} ${halfPlanned.length === 1 ? "has" : "have"} only half a plan and no exception recorded. An estimation objective and a safety outcome are allowed one; everything else owes both.`,
        },
  );

  /* S4-3: a binary row is complete, and reports the right kind of ratio. */
  const binary = rows.filter((r) => r.data_type === "binary" && !r.exception);
  const incomplete = binary.filter(
    (r) =>
      !r.effect_measure ||
      !r.absolute ||
      !r.adjusted?.model ||
      !r.adjusted?.fallback,
  );
  const wrongRatio = binary.filter(
    (r) =>
      ODDS.test(r.effect_measure) &&
      (r.expected_frequency === null || r.expected_frequency >= 0.1),
  );
  const badBinary = [...new Set([...incomplete, ...wrongRatio])];
  results.push(
    badBinary.length === 0
      ? ok("S4-3", "Every binary row states its measure, its model and its fallback, and carries an absolute measure beside the ratio.")
      : {
          id: "S4-3",
          pass: false,
          failing: badBinary.map((r) => r.objective),
          message: wrongRatio.length
            ? `${wrongRatio.map((r) => r.objective).join(", ")} reports an odds ratio for an outcome that is not known to be rare. An odds ratio reads like a risk ratio and is not one, and at a frequency of one in five it is nearly twice as far from 1.`
            : `${incomplete.map((r) => r.objective).join(", ")} is an incomplete binary row. "Logistic regression" on its own does not say how common the outcome is, what it estimates, or what is fitted when it fails.`,
        },
  );

  /* S4-4: the unit of analysis and the count per participant. */
  const vague = rows.filter(
    (r) => !r.unit_of_analysis.trim() || !r.count.trim(),
  );
  results.push(
    vague.length === 0
      ? ok("S4-4", "Every row states the unit of analysis and how many values each participant gives.")
      : {
          id: "S4-4",
          pass: false,
          failing: vague.map((r) => r.objective),
          message: `${vague.map((r) => r.objective).join(", ")} does not say what one row of the data is. Four readings from one woman analysed as four women is the commonest way a p value comes out too small.`,
        },
  );

  /* S4-5: the sample can carry the adjustment. */
  const groups = Math.max(facts.groups.length, 1);
  const total = facts.sample_size.per_group
    ? facts.sample_size.per_group * groups
    : null;
  const overFitted = rows.filter((r) => {
    const covariates = r.adjusted?.covariates.length ?? 0;
    if (!covariates || total === null) return false;
    // What limits a model is participants for a measured outcome and EVENTS
    // for a binary or a survival one. A trial of 400 people with 12 deaths can
    // carry one covariate, not four, and counting the 400 hides that.
    const countsEvents =
      r.data_type === "binary" || r.data_type === "time_to_event";
    const carrying = countsEvents ? (r.expected_frequency ?? 0.5) * total : total;
    return carrying / covariates < 10;
  });
  results.push(
    overFitted.length === 0
      ? ok("S4-5", "Every adjusted model is within the events-per-covariate cap the sample can carry.")
      : {
          id: "S4-5",
          pass: false,
          failing: overFitted.map((r) => r.objective),
          message: `${overFitted.map((r) => r.objective).join(", ")} adjusts for more covariates than this study can carry. A binary or survival model is limited by its events, not by its participants, and ten per covariate is the floor. Plan the unadjusted analysis and say why, rather than fitting a model that will not hold.`,
        },
  );

  /* S4-6: an ordered scale cut into two. */
  const byName = new Map(variables.map((v) => [v.name, v]));
  const flattened = rows.filter((row) => {
    if (row.data_type !== "binary") return false;
    const variable = byName.get(row.outcome);
    return (variable?.derived_from ?? []).some(
      (input) => byName.get(input)?.type === "ordinal",
    );
  });
  results.push(
    flattened.length === 0
      ? ok("S4-6", "No outcome cuts an ordered scale into two.")
      : {
          id: "S4-6",
          pass: false,
          failing: flattened.map((r) => r.objective),
          message: `${flattened.map((r) => r.objective).join(", ")} turns an ordered scale into a yes or no. A six-point scale cut at one point throws away every distinction except that one, and the loss is invisible once the outcome is binary. Report the ordinal analysis beside it, or say why the cut-off is the only thing that matters clinically.`,
        },
  );

  /* S4-7: nothing on the path from the exposure to the outcome. */
  const first = facts.timepoints[0] ?? "";
  const mediators = rows.flatMap((row) =>
    (row.adjusted?.covariates ?? [])
      .filter((covariate) => {
        const variable = byName.get(covariate.var);
        if (!variable) return false;
        // A covariate taken at the first visit is measured before anything
        // happened to the participant, so it cannot be on the path. One taken
        // later may be, and the plan has to say it is not.
        const takenAt = covariate.at ?? variable.timepoints[0] ?? first;
        return takenAt !== first && variable.timepoints.length > 0;
      })
      .map((covariate) => `${row.objective}: ${covariate.var}`),
  );
  results.push(
    mediators.length === 0
      ? ok("S4-7", "No adjusted model holds constant anything measured after the exposure.")
      : {
          id: "S4-7",
          pass: false,
          failing: mediators,
          message: `${mediators.join("; ")} is measured after the exposure and held constant by the model. Where it sits on the path from the exposure to the outcome it is a mediator, and adjusting for it removes the very effect being estimated. Take it out, or say in the plan why it cannot be on that path.`,
        },
  );

  /* S4-8: the sample size assumed the result the analysis estimates. */
  const primary = rows.find((r) => r.objective.startsWith("P1"));
  const assumed = facts.sample_size.formula_family.toLowerCase();
  const FAMILY: [RegExp, RegExp][] = [
    [/two.mean|mean difference|t.test/, /mean difference|ratio of geometric means/i],
    [/two.proportion|proportion|chi.square/, /risk ratio|odds ratio|prevalence ratio|risk difference/i],
    [/survival|log.rank|hazard/, /hazard ratio/i],
    [/rate|poisson/, /rate ratio/i],
    [/correlation/, /correlation/i],
  ];
  const stated = FAMILY.find(([formula]) => formula.test(assumed));
  const agrees =
    !primary || !assumed.trim() || !stated || stated[1].test(primary.effect_measure);
  results.push(
    agrees
      ? ok("S4-8", "The effect the sample size assumed is the effect the analysis estimates.")
      : {
          id: "S4-8",
          pass: false,
          failing: [primary!.objective],
          message: `The sample size was calculated from a ${facts.sample_size.formula_family} and the primary analysis estimates ${primary!.effect_measure.toLowerCase()}. One of the two is wrong, and neither section shows it on its own.`,
        },
  );

  return results;
}
