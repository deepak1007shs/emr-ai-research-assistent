/*
 * Adjustment sets — what a model may control for, and how much it can afford.
 *
 * Adjusting for a mediator subtracts the very effect the study is measuring;
 * adjusting for a collider manufactures one that was never there. Neither shows
 * up as an error in any software, which is exactly why the gate must catch it.
 *
 * ADJ02 no mediator in an adjustment set
 * ADJ03 no collider in an adjustment set
 * ADJ04 no analysis adjusts for its own outcome or its exposure
 * ADJ05 at least 10 events per degree of freedom
 * ADJ06 degrees of freedom are countable (a k-level categorical is k-1)
 * ADJ07 every covariate is either collected or derived from collected data
 */
'use strict';

const { degreesOfFreedom, isCaptured, isDerived, rawIngredients } = require('./_chain');

const name = 'adjustment';

const CATEGORICAL = new Set(['nominal', 'ordinal']);

/** Outcomes for which "events per degree of freedom" is the governing rule. */
const EVENT_DRIVEN = new Set(['binary', 'time_to_event']);

/**
 * How many events the model can expect to fit on.
 * @returns {{events: number|null, why?: string}}
 */
function estimateEvents(spec, outcome) {
  const ss = spec.sample_size || {};
  if (!outcome) return { events: null, why: 'its outcome does not resolve' };
  if (outcome.tier !== 'primary') {
    return { events: null, why: `${outcome.id} is not the outcome the sample size was computed for, so its event count is unknown` };
  }
  if (outcome.data_type !== 'binary') {
    return { events: null, why: `${outcome.id} is ${outcome.data_type}, so the sample size states no event proportion` };
  }
  const proportions = (ss.inputs || [])
    .filter((i) => i.name === 'p1' || i.name === 'p2')
    .map((i) => i.value)
    .filter((v) => typeof v === 'number');
  if (!proportions.length || typeof ss.n_total !== 'number') {
    return { events: null, why: 'the sample size states no p1 or p2 to estimate an event rate from' };
  }
  return { events: Math.floor(ss.n_total * Math.min(...proportions)) };
}

function check(spec, ctx) {
  const out = [];
  const exposures = new Set(
    (spec.variables || []).filter((v) => v.role === 'exposure').map((v) => v.id),
  );

  (spec.analyses || []).forEach((a, i) => {
    const covariates = a.covariate_ids || [];
    if (!covariates.length) return;
    const p = `analyses[${i}].covariate_ids`;
    const outcome = ctx.outcomes.get(a.outcome_id);

    /* Everything the outcome is made of — adjusting for any of it is circular. */
    const ofTheOutcome = new Set();
    for (const src of (outcome && outcome.source_variable_ids) || []) {
      ofTheOutcome.add(src);
      for (const rawId of rawIngredients(src, ctx).raw) ofTheOutcome.add(rawId);
    }

    let df = 0;
    let countable = true;

    for (const id of covariates) {
      const v = ctx.variables.get(id);
      if (!v) continue; // REF02 owns the dangling reference.

      if (v.role === 'mediator') {
        out.push({
          code: 'ADJ02',
          severity: 'ERROR',
          path: p,
          message: `${a.id} adjusts for ${id}, which is a mediator. Adjusting for a mediator subtracts part of the very effect being estimated — drop it from the model, and report the mediation separately if the question is worth asking.`,
        });
      }

      if (v.role === 'collider') {
        out.push({
          code: 'ADJ03',
          severity: 'ERROR',
          path: p,
          message: `${a.id} adjusts for ${id}, which is a collider. Conditioning on a common effect of the exposure and the outcome creates an association that does not exist — remove it from the adjustment set.`,
        });
      }

      if (ofTheOutcome.has(id)) {
        out.push({
          code: 'ADJ04',
          severity: 'ERROR',
          path: p,
          message: `${a.id} adjusts for ${id}, which is what its own outcome ${a.outcome_id} is measured from. A model cannot control for its own outcome — remove it.`,
        });
      } else if (exposures.has(id)) {
        out.push({
          code: 'ADJ04',
          severity: 'ERROR',
          path: p,
          message: `${a.id} lists the exposure ${id} as a covariate. The exposure is the term being estimated, not something to adjust away — it belongs in the model as the exposure, not in covariate_ids.`,
        });
      }

      if (CATEGORICAL.has(v.data_type) && !(v.categories || []).length) {
        countable = false;
        out.push({
          code: 'ADJ06',
          severity: 'ERROR',
          path: p,
          message: `${a.id} adjusts for ${id}, which is ${v.data_type} but lists no categories, so its degrees of freedom cannot be counted — a k-level categorical costs k-1, not 1. List its levels.`,
        });
      }

      if (!isCaptured(v)) {
        const chain = isDerived(v) ? rawIngredients(id, ctx) : { missing: [id] };
        if ((chain.missing || []).length) {
          out.push({
            code: 'ADJ07',
            severity: 'ERROR',
            path: p,
            message: `${a.id} adjusts for ${id}, which has no CRF field and is not derived from anything the form collects. A covariate nobody records cannot enter the model — give it a field, or drop it.`,
          });
        }
      }

      df += degreesOfFreedom(v);
    }

    /* The exposure occupies the model too. */
    for (const id of exposures) {
      if (!covariates.includes(id)) df += degreesOfFreedom(ctx.variables.get(id));
    }

    if (!countable || !outcome || !EVENT_DRIVEN.has(outcome.data_type)) return;

    const { events, why } = estimateEvents(spec, outcome);
    if (events === null) {
      out.push({
        code: 'ADJ05',
        severity: 'WARN',
        path: `analyses[${i}]`,
        message: `${a.id} fits ${df} degrees of freedom, but the events available cannot be estimated: ${why}. State the expected number of events so the model can be shown to be affordable — under 10 events per degree of freedom it will overfit.`,
      });
      return;
    }

    const perDf = events / df;
    if (perDf < 10) {
      out.push({
        code: 'ADJ05',
        severity: 'ERROR',
        path: `analyses[${i}]`,
        message: `${a.id} fits ${df} degrees of freedom on an estimated ${events} events (${perDf.toFixed(1)} per degree of freedom). Under 10 per degree of freedom the model overfits and the confidence intervals are not to be believed — drop covariates, collapse categories, or raise the sample size.`,
      });
    }
  });

  return out;
}

module.exports = { name, check };
