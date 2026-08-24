/*
 * Sample size — does the stated n actually follow from the stated inputs?
 *
 * A sample size nobody can reproduce is a number, not a justification. Every
 * formula here is recomputed from the spec's own inputs; where a formula is not
 * implemented the finding says so out loud rather than passing in silence.
 *
 * SS01 the powered outcome is the primary outcome
 * SS02 only one outcome is claimed as powered
 * SS03 the stated n reproduces from the stated inputs
 * SS04 every input names its source
 * SS05 an attrition allowance is stated
 */
'use strict';

const name = 'sample_size';

/** Rounding slack allowed between the stated n and the recomputed n. */
const TOLERANCE = 2;

/**
 * Standard normal quantile (Acklam's rational approximation, |error| < 1.2e-9).
 * Hardcoding 1.96 and 0.84 would silently pass any alpha and any power.
 */
function invNorm(p) {
  if (!(p > 0 && p < 1)) return NaN;
  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2,
    1.38357751867269e2, -3.066479806614716e1, 2.506628277459239];
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2,
    6.680131188771972e1, -1.328068155288572e1];
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838,
    -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996,
    3.754408661907416];
  const low = 0.02425;

  if (p < low) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (p > 1 - low) {
    const q = Math.sqrt(-2 * Math.log(1 - p));
    return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  const q = p - 0.5;
  const r = q * q;
  return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q /
    (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}

const norm = (s) => String(s || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_');

/** First input whose name matches one of the aliases, by value. */
function input(ss, aliases) {
  for (const alias of aliases) {
    const hit = (ss.inputs || []).find((i) => norm(i.name) === alias);
    if (hit && typeof hit.value === 'number') return hit.value;
  }
  return undefined;
}

/**
 * Recompute n from the inputs.
 * @returns {{n?: number, perGroup?: boolean, used?: string[], unverifiable?: string}}
 */
function recompute(ss) {
  const zA = invNorm(1 - (ss.alpha || 0) / 2);
  const zB = invNorm(ss.power || 0);
  if (!Number.isFinite(zA) || !Number.isFinite(zB)) {
    return { unverifiable: `alpha (${ss.alpha}) and power (${ss.power}) must both lie strictly between 0 and 1` };
  }

  const need = (label) => ({ unverifiable: `it states no ${label}` });
  const formula = norm(ss.formula);

  if (formula === 'single_proportion') {
    const p = input(ss, ['p', 'p1', 'prevalence', 'proportion', 'expected_proportion']);
    const d = input(ss, ['d', 'precision', 'absolute_precision', 'margin_of_error', 'delta']);
    if (p === undefined || d === undefined || d === 0) return need('p and d (absolute precision)');
    return { n: (zA * zA * p * (1 - p)) / (d * d), perGroup: false, used: [`p = ${p}`, `d = ${d}`] };
  }

  if (formula === 'single_mean') {
    const sd = input(ss, ['sd', 'sigma', 's', 'standard_deviation']);
    const d = input(ss, ['d', 'precision', 'absolute_precision', 'margin_of_error', 'delta']);
    if (sd === undefined || d === undefined || d === 0) return need('sd and d (absolute precision)');
    return { n: (zA * zA * sd * sd) / (d * d), perGroup: false, used: [`sd = ${sd}`, `d = ${d}`] };
  }

  if (formula === 'two_proportions') {
    const p1 = input(ss, ['p1', 'p_control', 'p_1']);
    const p2 = input(ss, ['p2', 'p_intervention', 'p_2']);
    if (p1 === undefined || p2 === undefined || p1 === p2) return need('two different proportions p1 and p2');
    const pBar = (p1 + p2) / 2;
    const term1 = zA * Math.sqrt(2 * pBar * (1 - pBar));
    const term2 = zB * Math.sqrt(p1 * (1 - p1) + p2 * (1 - p2));
    return {
      n: Math.pow(term1 + term2, 2) / Math.pow(p1 - p2, 2),
      perGroup: true,
      used: [`p1 = ${p1}`, `p2 = ${p2}`],
    };
  }

  if (formula === 'two_means') {
    const sd = input(ss, ['sd', 'sigma', 's', 'standard_deviation', 'sd_pooled']);
    const delta = input(ss, ['delta', 'difference', 'mean_difference', 'mcid', 'effect_size', 'd']);
    if (sd === undefined || delta === undefined || delta === 0) return need('sd and delta (the difference worth detecting)');
    return {
      n: (2 * sd * sd * Math.pow(zA + zB, 2)) / (delta * delta),
      perGroup: true,
      used: [`sd = ${sd}`, `delta = ${delta}`],
    };
  }

  if (formula === 'paired_means') {
    const sd = input(ss, ['sd_diff', 'sd_difference', 'sigma_d', 'sd_of_differences', 'sd', 'sigma']);
    const delta = input(ss, ['delta', 'difference', 'mean_difference', 'mcid', 'effect_size', 'd']);
    if (sd === undefined || delta === undefined || delta === 0) return need('the SD of the within-pair differences and delta');
    return {
      n: (sd * sd * Math.pow(zA + zB, 2)) / (delta * delta),
      perGroup: false,
      used: [`sd of differences = ${sd}`, `delta = ${delta}`],
    };
  }

  if (formula === 'correlation') {
    const r = input(ss, ['r', 'rho', 'correlation', 'expected_r']);
    if (r === undefined || Math.abs(r) >= 1 || r === 0) return need('a correlation r strictly between 0 and 1');
    const c = 0.5 * Math.log((1 + r) / (1 - r));
    return { n: Math.pow((zA + zB) / c, 2) + 3, perGroup: false, used: [`r = ${r}`] };
  }

  return { unverifiable: `the "${ss.formula}" formula is not one this gate can recompute` };
}

/** How many equal arms the total is split across. */
function armCount(spec) {
  const groups = (spec.study && spec.study.groups) || [];
  if (groups.length < 2) return 2;
  const ratios = new Set(groups.map((g) => String(g.allocation_ratio || '1')));
  return ratios.size === 1 ? groups.length : 0;
}

function check(spec, ctx) {
  const out = [];
  const ss = spec.sample_size;
  if (!ss || typeof ss !== 'object') return out;

  /* ---- SS01 / SS02: what the study is powered for -------------------- */

  const raw = ss.powered_outcome_id;
  const claimed = Array.isArray(raw)
    ? raw.filter((id) => typeof id === 'string')
    : typeof raw === 'string' ? [raw] : [];

  if (!claimed.length) {
    out.push({
      code: 'SS02',
      severity: 'ERROR',
      path: 'sample_size.powered_outcome_id',
      message: 'powered_outcome_id must name exactly one outcome id. State the single outcome the study is powered for.',
    });
  } else if (claimed.length > 1) {
    out.push({
      code: 'SS02',
      severity: 'ERROR',
      path: 'sample_size.powered_outcome_id',
      message: `${claimed.join(', ')} are all claimed as powered. A study is powered for one outcome — keep the primary one and report the rest as secondary, with confidence intervals rather than a powered claim.`,
    });
  }

  const primary = (spec.outcomes || []).find((o) => o.tier === 'primary');
  if (claimed.length && primary && claimed[0] !== primary.id) {
    out.push({
      code: 'SS01',
      severity: 'ERROR',
      path: 'sample_size.powered_outcome_id',
      message: `the sample size is powered for ${claimed[0]}, but the primary outcome is ${primary.id}. Power the study for the primary outcome, or make ${claimed[0]} the primary outcome.`,
    });
  }

  /* ---- SS03: does the arithmetic reproduce? -------------------------- */

  const result = recompute(ss);
  if (result.unverifiable) {
    out.push({
      code: 'SS03',
      severity: 'WARN',
      path: 'sample_size',
      message: `the stated n of ${ss.n_total} could not be checked: ${result.unverifiable}. Show the calculation in the SAP so a reader can reproduce it by hand.`,
    });
  } else {
    const attrition = typeof ss.attrition === 'number' ? ss.attrition : 0;
    if (attrition >= 1) {
      out.push({
        code: 'SS03',
        severity: 'ERROR',
        path: 'sample_size.attrition',
        message: `an attrition allowance of ${ss.attrition} would inflate the sample to infinity. State it as a proportion below 1.`,
      });
    } else {
      const expected = Math.ceil(result.n / (1 - attrition));
      const arms = result.perGroup ? armCount(spec) : 1;
      const inputs = result.used.concat([
        `alpha = ${ss.alpha}`, `power = ${ss.power}`,
        attrition ? `attrition = ${ss.attrition}` : 'no attrition allowance',
      ]).join(', ');
      const unit = result.perGroup ? 'per group' : 'in total';
      const stated = result.perGroup
        ? (typeof ss.n_per_group === 'number' ? ss.n_per_group : (arms ? ss.n_total / arms : undefined))
        : ss.n_total;

      if (typeof stated === 'number' && Math.abs(stated - expected) > TOLERANCE) {
        out.push({
          code: 'SS03',
          severity: 'ERROR',
          path: 'sample_size',
          message: `the stated ${stated} ${unit} does not follow from ${inputs}, which give ${expected} ${unit}. Correct the n, or correct the inputs it came from.`,
        });
      }

      if (result.perGroup && arms && typeof ss.n_per_group === 'number' &&
          typeof ss.n_total === 'number' &&
          Math.abs(ss.n_total - ss.n_per_group * arms) > TOLERANCE) {
        out.push({
          code: 'SS03',
          severity: 'ERROR',
          path: 'sample_size.n_total',
          message: `n_total is ${ss.n_total} but ${ss.n_per_group} per group across ${arms} equally allocated groups is ${ss.n_per_group * arms}. Make the total agree with the per-group figure.`,
        });
      }
    }
  }

  /* ---- SS04 / SS05: where the inputs came from ----------------------- */

  (ss.inputs || []).forEach((i, k) => {
    if (!i.source) {
      out.push({
        code: 'SS04',
        severity: 'WARN',
        path: `sample_size.inputs[${k}]`,
        message: `the input "${i.name}" = ${i.value} cites no source. Name the paper, the audit or the agreed clinical difference it came from — an assumed number with no provenance cannot be defended at viva.`,
      });
    }
  });

  if (typeof ss.attrition !== 'number') {
    out.push({
      code: 'SS05',
      severity: 'WARN',
      path: 'sample_size.attrition',
      message: 'no attrition allowance is stated. State the expected loss to follow-up (even if zero, say so) and inflate the recruitment target by it.',
    });
  }

  return out;
}

module.exports = { name, check, invNorm };
