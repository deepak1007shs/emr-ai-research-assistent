/*
 * Shell tables — the report as it will actually be read.
 *
 * The table set is where analysis drift becomes visible: a "Model 3" column
 * nobody can define, an adjusted estimate with nothing unadjusted to compare it
 * with, an effect with no interval around it.
 *
 * TBL01 numbers run 1, 2, 3 with no gaps
 * TBL02 blocks appear in reporting order
 * TBL03 every table has rows
 * TBL04 sensitivity tables come last
 * TBL05 a family of several analyses states its multiplicity position
 * TBL06 an analytical table names its test
 * TBL07 no column is called "Model 1"
 * TBL08 adjusted never appears without unadjusted
 * TBL09 every effect carries a 95% CI
 * TBL10 every categorical row declares its reference level
 */
'use strict';

const name = 'tables';

/** Reporting order. Sensitivity is placed by TBL04, not by this rank. */
const BLOCK_ORDER = ['descriptive', 'primary', 'secondary', 'exploratory'];

const ANALYTICAL = new Set(['comparative', 'effect']);
const CATEGORICAL = new Set(['nominal', 'ordinal', 'binary']);

/** A column that reports an effect, and therefore needs an interval. */
const EFFECT_COLUMN = /\bRR\b|\bOR\b|\bHR\b|\bIRR\b|difference|ratio/i;
const HAS_CI = /95\s*%\s*(confidence interval|ci)/i;

function check(spec, ctx) {
  const out = [];
  const tables = spec.tables || [];
  const ordered = tables
    .map((t, i) => ({ t, i }))
    .sort((a, b) => (a.t.number || 0) - (b.t.number || 0));

  /* ---- TBL01: contiguous numbering ---------------------------------- */

  const numbers = ordered.map(({ t }) => t.number);
  const expected = numbers.map((_, k) => k + 1);
  if (numbers.some((n, k) => n !== expected[k])) {
    out.push({
      code: 'TBL01',
      severity: 'ERROR',
      path: 'tables',
      message: `table numbers are ${numbers.join(', ')}; they must run ${expected.join(', ')} with no gaps and no repeats. Renumber them in reporting order.`,
    });
  }

  /* ---- TBL02 / TBL04: where each block sits ------------------------- */

  let rank = -1;
  let previous = null;
  for (const { t } of ordered) {
    if (t.block === 'sensitivity') continue;
    const here = BLOCK_ORDER.indexOf(t.block);
    if (here < rank) {
      out.push({
        code: 'TBL02',
        severity: 'ERROR',
        path: 'tables',
        message: `${t.id} is a ${t.block} table but is numbered after the ${previous} tables. Blocks are reported in the order ${BLOCK_ORDER.join(', ')}, then sensitivity — renumber ${t.id}.`,
      });
    }
    if (here > rank) {
      rank = here;
      previous = t.block;
    }
  }

  const firstSensitivity = ordered.find(({ t }) => t.block === 'sensitivity');
  if (firstSensitivity) {
    for (const { t } of ordered) {
      if (t.block !== 'sensitivity' && (t.number || 0) > (firstSensitivity.t.number || 0)) {
        out.push({
          code: 'TBL04',
          severity: 'ERROR',
          path: 'tables',
          message: `${t.id} (${t.block}) is numbered after the sensitivity table ${firstSensitivity.t.id}. Sensitivity analyses close the report — number every sensitivity table last.`,
        });
      }
    }
  }

  /* ---- per table ----------------------------------------------------- */

  tables.forEach((t, i) => {
    const p = `tables[${i}]`;
    const rows = t.row_variable_ids || [];
    const columns = t.columns || [];

    if (!rows.length) {
      out.push({
        code: 'TBL03',
        severity: 'ERROR',
        path: `${p}.row_variable_ids`,
        message: `${t.id} has no row variables, so there is nothing to print in it. List the variables that form its rows, or delete the table.`,
      });
    }

    if (ANALYTICAL.has(t.kind) && !t.test_applied) {
      out.push({
        code: 'TBL06',
        severity: 'ERROR',
        path: `${p}.test_applied`,
        message: `${t.id} is a ${t.kind} table but does not name the test it applies. A P value with no named test cannot be reproduced — state the test in test_applied so it prints under the table.`,
      });
    }

    for (const column of columns) {
      if (/^Model\s*\d/i.test(String(column).trim())) {
        out.push({
          code: 'TBL07',
          severity: 'ERROR',
          path: `${p}.columns`,
          message: `${t.id} has a column called "${column}". "Model 1" tells a reader nothing — name what the model adjusts for, for example "Adjusted for age and sex, RR (95% CI)".`,
        });
      }
    }

    const adjusted = columns.filter((c) => /adjusted/i.test(c) && !/unadjusted/i.test(c));
    const unadjusted = columns.filter((c) => /unadjusted/i.test(c));
    if (adjusted.length && !unadjusted.length) {
      out.push({
        code: 'TBL08',
        severity: 'ERROR',
        path: `${p}.columns`,
        message: `${t.id} reports "${adjusted[0]}" with no unadjusted column beside it. Print both: the difference between the crude and the adjusted estimate is what shows the adjustment did anything.`,
      });
    }

    for (const column of columns) {
      if (EFFECT_COLUMN.test(column) && !HAS_CI.test(column)) {
        out.push({
          code: 'TBL09',
          severity: 'ERROR',
          path: `${p}.columns`,
          message: `${t.id}'s column "${column}" reports an effect with no interval. Label it "${String(column).trim()} (95% CI)" — a point estimate without its precision cannot be interpreted.`,
        });
      }
    }

    if (ANALYTICAL.has(t.kind)) {
      const references = new Set(t.reference_rows || []);
      for (const id of rows) {
        const v = ctx.variables.get(id);
        if (!v || !CATEGORICAL.has(v.data_type)) continue;
        if (!references.has(id)) {
          out.push({
            code: 'TBL10',
            severity: 'ERROR',
            path: `${p}.reference_rows`,
            message: `${t.id} compares by ${id}, which is ${v.data_type}, but does not list it in reference_rows. Every category is read against a reference — name it (${v.reference_level ? `"${v.reference_level}"` : 'set reference_level on the variable first'}) so the table can mark it.`,
          });
        }
      }
    }
  });

  /* ---- TBL05: several analyses in one family ------------------------ */

  const families = new Map();
  for (const a of spec.analyses || []) {
    const outcome = ctx.outcomes.get(a.outcome_id);
    if (!outcome) continue;
    const list = families.get(outcome.tier) || [];
    list.push(a.id);
    families.set(outcome.tier, list);
  }

  for (const [tier, ids] of families) {
    if (ids.length < 2) continue;
    const stated = (spec.multiplicity || []).some((m) =>
      String(m.family || '').toLowerCase().includes(tier));
    if (!stated) {
      out.push({
        code: 'TBL05',
        severity: 'WARN',
        path: 'multiplicity',
        message: `the ${tier} family holds ${ids.length} analyses (${ids.join(', ')}) but multiplicity says nothing about it. State the position — a formal correction, or reporting with confidence intervals as supportive rather than confirmatory — before the results are seen.`,
      });
    }
  }

  return out;
}

module.exports = { name, check };
