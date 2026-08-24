/*
 * Outcomes — the middle of the traceability chain.
 *
 * OUT01 exactly one primary outcome
 * OUT02 every outcome has an analysis
 * OUT03 continuous and count outcomes carry a unit
 * OUT06 a summary statistic is stated
 * OUT07 every outcome names its source variables
 * OUT08 those variables' chains terminate in captured variables
 * OUT09 the summary statistic is one the data type permits
 */
'use strict';

const { rawIngredients } = require('./_chain');

const name = 'outcomes';

/** What each data type may be summarised by. */
const PERMITTED = {
  continuous: ['mean (sd)', 'median (iqr)', 'mean difference', 'median difference', 'geometric mean'],
  count: ['mean (sd)', 'median (iqr)', 'rate', 'incidence rate'],
  binary: ['proportion', 'percentage', 'n (%)', 'risk', 'odds'],
  ordinal: ['median (iqr)', 'n (%)', 'proportion', 'distribution'],
  nominal: ['n (%)', 'proportion', 'percentage', 'distribution'],
  time_to_event: ['median survival', 'kaplan-meier estimate', 'incidence rate', 'hazard'],
  date: ['median (iqr)', 'range'],
  text: ['narrative'],
};

const normalise = (s) => String(s || '').trim().toLowerCase();

function check(spec, ctx) {
  const out = [];
  const outcomes = spec.outcomes || [];
  const analysed = new Set((spec.analyses || []).map((a) => a.outcome_id));

  const primaries = outcomes.filter((o) => o.tier === 'primary');
  if (primaries.length !== 1) {
    out.push({
      code: 'OUT01',
      severity: 'ERROR',
      path: 'outcomes',
      message:
        primaries.length === 0
          ? 'no primary outcome. Exactly one outcome must be the one the study is powered for.'
          : `${primaries.length} primary outcomes (${primaries.map((o) => o.id).join(', ')}). Pick one; the rest are secondary.`,
    });
  }

  outcomes.forEach((o, i) => {
    if (!analysed.has(o.id)) {
      out.push({
        code: 'OUT02',
        severity: 'ERROR',
        path: `outcomes[${i}]`,
        message: `${o.id} has no analysis. An outcome nobody analyses should not be collected — add an analysis or remove the outcome.`,
      });
    }

    if ((o.data_type === 'continuous' || o.data_type === 'count') && !o.unit) {
      out.push({
        code: 'OUT03',
        severity: 'ERROR',
        path: `outcomes[${i}].unit`,
        message: `${o.id} is ${o.data_type} but states no unit. A number without a unit cannot be analysed or reported.`,
      });
    }

    if (!o.summary_statistic) {
      out.push({
        code: 'OUT06',
        severity: 'ERROR',
        path: `outcomes[${i}].summary_statistic`,
        message: `${o.id} states no summary statistic, so no shell-table row can be written for it.`,
      });
    } else {
      const permitted = PERMITTED[o.data_type] || [];
      const stat = normalise(o.summary_statistic);
      const allowed = permitted.some((p) => stat.includes(p) || p.includes(stat));
      if (permitted.length && !allowed) {
        out.push({
          code: 'OUT09',
          severity: 'ERROR',
          path: `outcomes[${i}].summary_statistic`,
          message: `${o.id} is ${o.data_type} but is summarised as "${o.summary_statistic}". Permitted here: ${permitted.join('; ')}.`,
        });
      }
    }

    const sources = o.source_variable_ids || [];
    if (!sources.length) {
      out.push({
        code: 'OUT07',
        severity: 'ERROR',
        path: `outcomes[${i}].source_variable_ids`,
        message: `${o.id} names no source variables, so nothing on the form measures it.`,
      });
    }

    for (const varId of sources) {
      const chain = rawIngredients(varId, ctx);
      if (chain.cycle) {
        out.push({
          code: 'OUT08',
          severity: 'ERROR',
          path: `outcomes[${i}].source_variable_ids`,
          message: `${o.id} depends on ${varId}, whose derivation refers back to itself.`,
        });
      }
      if (chain.missing.length) {
        out.push({
          code: 'OUT08',
          severity: 'ERROR',
          path: `outcomes[${i}].source_variable_ids`,
          message: `${o.id} depends on ${varId}, whose chain never reaches data the form collects (${[...new Set(chain.missing)].join(', ')} has no CRF field). Give the raw ingredients a place on the form.`,
        });
      }
    }
  });

  return out;
}

module.exports = { name, check };
