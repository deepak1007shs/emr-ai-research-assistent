/*
 * The frame around the analysis: who is analysed, who gets in, and when.
 *
 * POP01 an interventional study names its analysis populations
 * POP02 exactly one population is the primary one
 * ELG01 there are inclusion and exclusion criteria
 * ELG02 the numeric criteria leave no one uncovered
 * TP01 every timepoint has a window
 * TP02 timepoints are numbered in the order they happen
 * GDL01 a CONSORT or STROBE study can draw its flow diagram
 *
 * GDL02 (a time-to-event outcome with no censoring variable) would duplicate
 * SURV02 exactly, so it is emitted from tests.js alone.
 */
'use strict';

const { isInterventional } = require('./design');

const name = 'structure';

const FLOW_DIAGRAM_GUIDELINES = new Set(['CONSORT', 'STROBE']);

function check(spec, ctx) {
  const out = [];
  const study = spec.study || {};

  /* ---- POP01 / POP02 -------------------------------------------------- */

  const populations = spec.populations;
  if (isInterventional(study.design) && !(Array.isArray(populations) && populations.length)) {
    out.push({
      code: 'POP01',
      severity: 'ERROR',
      path: 'populations',
      message: `${study.design} allocates an intervention but the spec defines no analysis populations. Say who is analysed — intention-to-treat, modified intention-to-treat, per-protocol — and which population carries the primary analysis, before anyone drops out.`,
    });
  } else if (Array.isArray(populations) && populations.length) {
    const primary = populations.filter((p) => p.primary === true);
    if (primary.length !== 1) {
      out.push({
        code: 'POP02',
        severity: 'ERROR',
        path: 'populations',
        message: primary.length === 0
          ? `none of ${populations.map((p) => p.id).join(', ')} is marked primary. Exactly one population carries the primary analysis — mark it, or the choice gets made after the results are seen.`
          : `${primary.map((p) => p.id).join(', ')} are all marked primary. Exactly one population carries the primary analysis; the rest are sensitivity analyses.`,
      });
    }
  }

  /* ---- ELG01 / ELG02 --------------------------------------------------- */

  const eligibility = spec.eligibility || {};
  for (const key of ['inclusion', 'exclusion']) {
    if (!(eligibility[key] || []).length) {
      out.push({
        code: 'ELG01',
        severity: 'ERROR',
        path: `eligibility.${key}`,
        message: `no ${key} criteria. State them: an unstated ${key} rule is applied anyway, differently by each person screening, and cannot be reported in the flow diagram.`,
      });
    }
  }

  const numeric = (c) => (c && c.numeric && c.numeric.variable_id ? c.numeric : null);
  for (const inc of eligibility.inclusion || []) {
    const bound = numeric(inc);
    if (!bound) continue;
    for (const exc of eligibility.exclusion || []) {
      const cut = numeric(exc);
      if (!cut || cut.variable_id !== bound.variable_id) continue;
      const label = (ctx.variables.get(bound.variable_id) || {}).label || bound.variable_id;

      if (typeof bound.max === 'number' && typeof cut.min === 'number' && cut.min > bound.max + 1) {
        out.push({
          code: 'ELG02',
          severity: 'ERROR',
          path: 'eligibility',
          message: `${label} above ${bound.max} is not included by ${inc.id} and not excluded by ${exc.id}, which starts at ${cut.min}. Values between ${bound.max} and ${cut.min} are covered by neither rule — close the gap by moving one boundary.`,
        });
      }

      if (typeof bound.min === 'number' && typeof cut.max === 'number' && cut.max < bound.min - 1) {
        out.push({
          code: 'ELG02',
          severity: 'ERROR',
          path: 'eligibility',
          message: `${label} below ${bound.min} is not included by ${inc.id}, and ${exc.id} excludes only up to ${cut.max}. Values between ${cut.max} and ${bound.min} are covered by neither rule — close the gap by moving one boundary.`,
        });
      }
    }
  }

  /* ---- TP01 / TP02 ----------------------------------------------------- */

  const timepoints = spec.timepoints || [];
  timepoints.forEach((tp, i) => {
    if (!tp.window) {
      out.push({
        code: 'TP01',
        severity: 'ERROR',
        path: `timepoints[${i}].window`,
        message: `${tp.id} states no window. "Day 30" is not a protocol: say day 30 plus or minus 3, so a visit on day 33 is a protocol visit and a visit on day 40 is a deviation.`,
      });
    }
  });

  const byOrder = timepoints.slice().sort((a, b) => (a.order || 0) - (b.order || 0));
  const orders = byOrder.map((tp) => tp.order);
  const expected = orders.map((_, i) => i + 1);
  if (orders.some((o, i) => o !== expected[i])) {
    out.push({
      code: 'TP02',
      severity: 'ERROR',
      path: 'timepoints',
      message: `timepoint order values are ${orders.join(', ')}; they must run ${expected.join(', ')} with no gaps and no repeats. Renumber them in the order the visits happen.`,
    });
  }

  for (let i = 1; i < byOrder.length; i += 1) {
    const before = byOrder[i - 1];
    const here = byOrder[i];
    if (typeof before.offset_days === 'number' && typeof here.offset_days === 'number' &&
        here.offset_days < before.offset_days) {
      out.push({
        code: 'TP02',
        severity: 'ERROR',
        path: 'timepoints',
        message: `${here.id} is numbered after ${before.id} but happens earlier (day ${here.offset_days} against day ${before.offset_days}). Renumber them so the order matches the calendar.`,
      });
    }
  }

  /* ---- GDL01 ----------------------------------------------------------- */

  if (FLOW_DIAGRAM_GUIDELINES.has(study.guideline)) {
    const screening = (spec.variables || []).some((v) =>
      v.role === 'administrative' && /screen/i.test(v.label || ''));
    if (!screening) {
      out.push({
        code: 'GDL01',
        severity: 'ERROR',
        path: 'variables',
        message: `a ${study.guideline} study must report how many people were screened, but no administrative variable mentions screening, so the flow diagram cannot be drawn. Add a screening-log variable recording the outcome of each assessment (randomised, ineligible, declined).`,
      });
    }
  }

  return out;
}

module.exports = { name, check };
