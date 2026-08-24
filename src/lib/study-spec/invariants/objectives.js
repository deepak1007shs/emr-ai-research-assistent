/*
 * Objectives — the top of the traceability chain.
 *
 * OBJ01 exactly one primary objective
 * OBJ02 every objective names at least one outcome
 * OBJ03 an outcome's tier agrees with its objective's tier
 * OBJ04 no orphan outcomes
 * OBJ05 the primary objective declares a full ICH E9(R1) estimand
 * OBJ06 non-inferiority and equivalence objectives declare a margin
 */
'use strict';

const name = 'objectives';

const ESTIMAND_ATTRIBUTES = [
  'treatment_condition',
  'population',
  'endpoint',
  'intercurrent_event_strategy',
  'population_level_summary',
];

function check(spec, ctx) {
  const out = [];
  const objectives = spec.objectives || [];

  const primaries = objectives.filter((o) => o.tier === 'primary');
  if (primaries.length !== 1) {
    out.push({
      code: 'OBJ01',
      severity: 'ERROR',
      path: 'objectives',
      message:
        primaries.length === 0
          ? 'no primary objective. Exactly one objective must be the question the study is powered for — promote one.'
          : `${primaries.length} primary objectives (${primaries.map((o) => o.id).join(', ')}). Exactly one is allowed — demote the others to secondary.`,
    });
  }

  objectives.forEach((o, i) => {
    if (!(o.outcome_ids || []).length) {
      out.push({
        code: 'OBJ02',
        severity: 'ERROR',
        path: `objectives[${i}]`,
        message: `${o.id} names no outcome. An objective with no outcome is a wish, not a question — give it a measurable outcome.`,
      });
    }

    for (const outId of o.outcome_ids || []) {
      const outcome = ctx.outcomes.get(outId);
      if (outcome && outcome.tier !== o.tier) {
        out.push({
          code: 'OBJ03',
          severity: 'ERROR',
          path: `objectives[${i}].outcome_ids`,
          message: `${o.id} is ${o.tier} but its outcome ${outId} is ${outcome.tier}. Make the tiers agree.`,
        });
      }
    }

    if (o.tier === 'primary') {
      const estimand = o.estimand || {};
      const missing = ESTIMAND_ATTRIBUTES.filter((a) => !estimand[a]);
      if (missing.length) {
        out.push({
          code: 'OBJ05',
          severity: 'ERROR',
          path: `objectives[${i}].estimand`,
          message: `${o.id} is the primary objective but its estimand is missing: ${missing.join(', ')}. All five ICH E9(R1) attributes are required — the intercurrent-event strategy in particular decides how treatment discontinuation, rescue therapy and death are handled.`,
        });
      }
    }

    if (
      (o.comparison_type === 'non_inferiority' || o.comparison_type === 'equivalence') &&
      !o.margin
    ) {
      out.push({
        code: 'OBJ06',
        severity: 'ERROR',
        path: `objectives[${i}].margin`,
        message: `${o.id} is a ${o.comparison_type.replace('_', '-')} question with no margin. State the margin and justify it clinically — without it the sample size cannot be checked and the result cannot be interpreted.`,
      });
    }
  });

  const claimed = new Set(objectives.flatMap((o) => o.outcome_ids || []));
  (spec.outcomes || []).forEach((outcome, i) => {
    if (!claimed.has(outcome.id)) {
      out.push({
        code: 'OBJ04',
        severity: 'ERROR',
        path: `outcomes[${i}]`,
        message: `${outcome.id} belongs to no objective. Either attach it to one, or remove it.`,
      });
    }
  });

  return out;
}

module.exports = { name, check };
