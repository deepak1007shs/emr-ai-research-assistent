/*
 * Tests and models — does the statistic fit the data it will be applied to?
 *
 * A t-test on a binary outcome, a risk ratio from a case-control study, a Cox
 * model with no proportional-hazards check: each is a result that reads as
 * confidently as a correct one.
 *
 * TEST01 the unadjusted test fits the outcome's data type
 * TEST02 the test matches the pairing of the design
 * TEST03 the adjusted model fits the outcome's data type
 * TEST04 the effect measure is one the model actually produces
 * TEST05 a case-control design does not claim a risk
 * TEST06 a common outcome is not reported as an odds ratio
 * SURV01 a Cox model declares a proportional-hazards check
 * SURV02 a time-to-event outcome has a censoring variable
 */
'use strict';

const name = 'tests';

const norm = (s) => String(s || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_');

/** Unpaired tests each data type permits. */
const TESTS = {
  binary: ['chi_square', 'fisher', 'fisher_exact', 'z_test_proportions'],
  nominal: ['chi_square', 'fisher', 'fisher_exact'],
  ordinal: ['mann_whitney', 'wilcoxon_rank_sum', 'kruskal_wallis', 'chi_square', 'chi_square_trend', 'fisher', 'fisher_exact'],
  continuous: ['t_test', 'welch_t', 'welch_t_test', 'mann_whitney', 'anova', 'kruskal_wallis'],
  count: ['poisson_test', 'negative_binomial_test', 'mann_whitney', 't_test', 'chi_square'],
  time_to_event: ['log_rank', 'stratified_log_rank', 'gehan_wilcoxon'],
};

/** Paired tests each data type permits. */
const PAIRED_TESTS = {
  binary: ['mcnemar'],
  nominal: ['mcnemar', 'stuart_maxwell'],
  ordinal: ['wilcoxon', 'wilcoxon_signed_rank', 'sign_test'],
  continuous: ['paired_t', 'paired_t_test', 'wilcoxon', 'wilcoxon_signed_rank'],
  count: ['paired_t', 'wilcoxon', 'wilcoxon_signed_rank'],
  time_to_event: ['stratified_log_rank'],
};

/** Every test that assumes paired data, whatever the outcome type. */
const ASSUMES_PAIRS = new Set(
  ['mcnemar', 'stuart_maxwell', 'paired_t', 'paired_t_test', 'wilcoxon', 'wilcoxon_signed_rank', 'sign_test'],
);

const MODELS = {
  binary: ['logistic', 'log_binomial', 'modified_poisson', 'poisson_robust', 'probit'],
  continuous: ['linear', 'ancova', 'mixed_linear', 'linear_mixed', 'quantile'],
  time_to_event: ['cox', 'parametric_survival', 'flexible_parametric', 'weibull', 'aft'],
  count: ['poisson', 'negative_binomial', 'zero_inflated_poisson', 'zero_inflated_negative_binomial'],
  ordinal: ['ordinal', 'ordinal_logistic', 'proportional_odds'],
  nominal: ['multinomial', 'multinomial_logistic'],
};

/** What each model can put a confidence interval around. */
const EFFECTS = {
  logistic: ['odds_ratio'],
  probit: ['odds_ratio'],
  log_binomial: ['risk_ratio'],
  modified_poisson: ['risk_ratio'],
  poisson_robust: ['risk_ratio'],
  linear: ['mean_difference'],
  ancova: ['mean_difference'],
  mixed_linear: ['mean_difference'],
  linear_mixed: ['mean_difference'],
  quantile: ['median_difference'],
  cox: ['hazard_ratio'],
  parametric_survival: ['hazard_ratio'],
  flexible_parametric: ['hazard_ratio'],
  weibull: ['hazard_ratio'],
  aft: ['time_ratio'],
  poisson: ['rate_ratio'],
  negative_binomial: ['rate_ratio'],
  zero_inflated_poisson: ['rate_ratio'],
  zero_inflated_negative_binomial: ['rate_ratio'],
  ordinal: ['odds_ratio'],
  ordinal_logistic: ['odds_ratio'],
  proportional_odds: ['odds_ratio'],
  multinomial: ['odds_ratio'],
  multinomial_logistic: ['odds_ratio'],
};

/** What a case-control study cannot estimate, because it samples on outcome. */
const NEEDS_A_COHORT = new Set(['risk_ratio', 'absolute_risk', 'risk_difference']);

const readable = (list) => list.join(', ').replace(/_/g, '-');

function check(spec, ctx) {
  const out = [];
  const design = norm((spec.study || {}).design);
  const caseControl = design.startsWith('case_control');
  const primary = (spec.outcomes || []).find((o) => o.tier === 'primary');

  (spec.analyses || []).forEach((a, i) => {
    const p = `analyses[${i}]`;
    const outcome = ctx.outcomes.get(a.outcome_id);
    if (!outcome) return; // REF02 owns it.
    const type = outcome.data_type;
    const test = norm(a.unadjusted_test);
    const paired = a.paired === true;

    /* ---- TEST02 before TEST01: pairing decides which list applies ---- */

    if (ASSUMES_PAIRS.has(test) && !paired) {
      out.push({
        code: 'TEST02',
        severity: 'ERROR',
        path: `${p}.unadjusted_test`,
        message: `${a.id} applies ${readable([test])}, which assumes paired observations, but the analysis is not marked paired. Either set paired: true if each participant contributes both measurements, or use an unpaired test (${readable(TESTS[type] || [])}).`,
      });
    } else if (!ASSUMES_PAIRS.has(test) && paired && (PAIRED_TESTS[type] || []).length) {
      out.push({
        code: 'TEST02',
        severity: 'ERROR',
        path: `${p}.unadjusted_test`,
        message: `${a.id} is marked paired but applies ${readable([test])}, which treats the two measurements as independent samples. Use ${readable(PAIRED_TESTS[type])} instead, or set paired: false.`,
      });
    } else {
      const permitted = paired ? PAIRED_TESTS[type] : TESTS[type];
      if (permitted && permitted.length && !permitted.includes(test)) {
        out.push({
          code: 'TEST01',
          severity: 'ERROR',
          path: `${p}.unadjusted_test`,
          message: `${a.id} uses ${readable([test])} on a ${type} outcome (${outcome.id}). Permitted for ${type}${paired ? ' paired' : ''} data: ${readable(permitted)}.`,
        });
      }
    }

    /* ---- TEST03 / TEST04 / SURV01: the adjusted model ---------------- */

    const model = norm(a.adjusted_model);
    if (model) {
      const permitted = MODELS[type];
      if (permitted && !permitted.includes(model)) {
        out.push({
          code: 'TEST03',
          severity: 'ERROR',
          path: `${p}.adjusted_model`,
          message: `${a.id} fits a ${readable([model])} model to a ${type} outcome (${outcome.id}). A ${type} outcome takes ${readable(permitted)}.`,
        });
      }

      const measure = norm(a.effect_measure);
      const produces = EFFECTS[model];
      if (measure && produces && !produces.includes(measure)) {
        out.push({
          code: 'TEST04',
          severity: 'ERROR',
          path: `${p}.effect_measure`,
          message: `${a.id} reports ${readable([measure])} from a ${readable([model])} model, which estimates ${readable(produces)}. Report what the model produces, or fit the model that produces what you want to report.`,
        });
      }

      if (model === 'cox' && !a.ph_check) {
        out.push({
          code: 'SURV01',
          severity: 'ERROR',
          path: `${p}.ph_check`,
          message: `${a.id} fits a Cox model but states no proportional-hazards check. Say how it will be checked (Schoenfeld residuals, log-minus-log plots) and what will be done if it fails.`,
        });
      }
    }

    /* ---- TEST05: what the design can and cannot estimate ------------- */

    const measure = norm(a.effect_measure);
    if (caseControl && NEEDS_A_COHORT.has(measure)) {
      out.push({
        code: 'TEST05',
        severity: 'ERROR',
        path: `${p}.effect_measure`,
        message: `${a.id} reports ${readable([measure])}, which a ${design.replace(/_/g, '-')} design cannot estimate: cases and controls are sampled by outcome, so no risk is observable. Report an odds ratio.`,
      });
    }

    /* ---- TEST06: an odds ratio on a common outcome ------------------- */

    if (primary && outcome.id === primary.id && model === 'logistic' && measure === 'odds_ratio') {
      const common = ((spec.sample_size || {}).inputs || [])
        .filter((input) => input.name === 'p1' || input.name === 'p2')
        .filter((input) => typeof input.value === 'number' && input.value > 0.1);
      if (common.length) {
        out.push({
          code: 'TEST06',
          severity: 'WARN',
          path: `${p}.effect_measure`,
          message: `${a.id} reports an odds ratio for ${outcome.id}, which the sample size expects in ${common.map((c) => `${c.name} = ${c.value}`).join(' and ')} of participants. At that frequency an odds ratio overstates the risk ratio and will be read as one — fit a log-binomial model (or Poisson with robust variance) and report a risk ratio.`,
        });
      }
    }
  });

  /* ---- SURV02: nothing to censor on --------------------------------- */

  const hasCensoring = (spec.variables || []).some((v) => v.role === 'censoring');
  if (!hasCensoring) {
    (spec.outcomes || []).forEach((o, i) => {
      if (o.data_type === 'time_to_event') {
        out.push({
          code: 'SURV02',
          severity: 'ERROR',
          path: `outcomes[${i}]`,
          message: `${o.id} is a time-to-event outcome but no variable has role "censoring". Time to event is two numbers, not one: add the variable that records whether the event happened and the date the participant was last known event-free.`,
        });
      }
    });
  }

  return out;
}

module.exports = { name, check };
