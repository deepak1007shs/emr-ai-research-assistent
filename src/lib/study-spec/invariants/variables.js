/*
 * Variables — the bottom of the chain, and the raw-in / derived-out rule.
 *
 * The CRF collects raw and rich data. Anything computed — a difference, a score,
 * a grade, a band — is a derivation and belongs in the SAP and the tables.
 */
'use strict';

const { isDerived, isCaptured, rawIngredients, looksLikeBand } = require('./_chain');

const name = 'variables';

/**
 * Roles that are needed by definition rather than by reference. The exposure is
 * what every comparative analysis compares by; censoring, matching and
 * stratification are structural; eligibility drives the screening log.
 */
const STRUCTURAL_ROLES = new Set([
  'exposure', 'censoring', 'matching', 'stratifier', 'eligibility', 'administrative',
]);

/** Variables something downstream actually needs. */
function reachable(spec, ctx) {
  const need = new Set();
  const add = (id) => {
    if (!id || need.has(id)) return;
    need.add(id);
    const v = ctx.variables.get(id);
    for (const parent of (v && v.derived_from) || []) add(parent);
  };

  for (const o of spec.outcomes || []) for (const id of o.source_variable_ids || []) add(id);
  for (const a of spec.analyses || []) for (const id of a.covariate_ids || []) add(id);
  for (const t of spec.tables || []) for (const id of t.row_variable_ids || []) add(id);
  for (const key of ['inclusion', 'exclusion']) {
    for (const c of ((spec.eligibility || {})[key]) || []) {
      add(c.variable_id);
      if (c.numeric) add(c.numeric.variable_id);
    }
  }
  for (const v of spec.variables || []) if (STRUCTURAL_ROLES.has(v.role)) add(v.id);
  return need;
}

function check(spec, ctx) {
  const out = [];
  const variables = spec.variables || [];
  const needed = reachable(spec, ctx);
  const analysisVars = new Set(
    (spec.analyses || []).flatMap((a) => a.covariate_ids || []),
  );

  variables.forEach((v, i) => {
    const p = `variables[${i}]`;

    if (!needed.has(v.id)) {
      out.push({
        code: 'VAR01',
        severity: 'WARN',
        path: p,
        message: `${v.id} is not used by any outcome, analysis, table or eligibility rule. Either use it or stop collecting it — a field nobody analyses is a question asked for nothing.`,
      });
    }

    if (isDerived(v)) {
      if (!(v.derived_from || []).length || !v.derivation || !v.derivation_kind) {
        out.push({
          code: 'VAR04',
          severity: 'ERROR',
          path: p,
          message: `${v.id} is derived but does not say from what, how, or of what kind. Give it derived_from, derivation and derivation_kind.`,
        });
      }
      if (v.crf) {
        out.push({
          code: 'VAR05',
          severity: 'ERROR',
          path: `${p}.crf`,
          message: `${v.id} is derived but has a CRF field. A computed value must never be a box someone fills in — remove the field and let the SAP compute it.`,
        });
      }

      const chain = rawIngredients(v.id, ctx);
      if (chain.cycle) {
        out.push({
          code: 'VAR08',
          severity: 'ERROR',
          path: p,
          message: `${v.id}'s derivation refers back to itself.`,
        });
      } else if (chain.missing.length) {
        out.push({
          code: 'VAR07',
          severity: 'ERROR',
          path: p,
          message: `${v.id} is derived from ${[...new Set(chain.missing)].join(', ')}, which the form never collects. A derivation whose ingredients are not captured cannot be computed.`,
        });
      }

      if (v.derivation_kind === 'band') {
        const source = ctx.variables.get((v.derived_from || [])[0]);
        if (!source || source.data_type !== 'continuous' || !isCaptured(source)) {
          out.push({
            code: 'VAR11',
            severity: 'ERROR',
            path: p,
            message: `${v.id} is a band, so its source must be a continuous variable the form captures. Collect the number and band it at analysis.`,
          });
        }
      }

      if (v.derivation_kind === 'score') {
        const components = v.derived_from || [];
        if (components.length < 2) {
          out.push({
            code: 'VAR13',
            severity: 'ERROR',
            path: p,
            message: `${v.id} is a score but lists ${components.length} component item(s). List every item the score is computed from.`,
          });
        }
        for (const c of components) {
          const item = ctx.variables.get(c);
          if (item && !isCaptured(item)) {
            out.push({
              code: 'VAR13',
              severity: 'ERROR',
              path: p,
              message: `${v.id} is a score whose component ${c} has no CRF field. The form collects the items; the total is computed.`,
            });
          }
        }
      }
    } else {
      if (analysisVars.has(v.id) && !isCaptured(v)) {
        out.push({
          code: 'VAR06',
          severity: 'ERROR',
          path: p,
          message: `${v.id} is used in an analysis but has no CRF field, so it will never be collected.`,
        });
      }
    }

    if ((v.data_type === 'nominal' || v.data_type === 'ordinal') && !(v.categories || []).length) {
      out.push({
        code: 'VAR09',
        severity: 'ERROR',
        path: p,
        message: `${v.id} is ${v.data_type} but lists no categories, so neither the form nor the tables know its levels.`,
      });
    }

    if (!isDerived(v) && looksLikeBand(v.categories)) {
      out.push({
        code: 'VAR12',
        severity: 'WARN',
        path: p,
        message: `${v.id}'s categories look like numeric bands, but nothing says what they were banded from. Collect the underlying number and derive the band — once a band is recorded, the number is gone for good and a different cut-point becomes impossible.`,
      });
    }

    if (!v.data_type || !v.subtype) {
      out.push({
        code: 'VAR14',
        severity: 'ERROR',
        path: p,
        message: `${v.id} must declare both data_type and subtype — one alone does not determine a summary statistic or a test.`,
      });
    }

    const clinical = (v.categories || []).length > 0;
    if (clinical && (!v.definition_source || !v.definition_reference)) {
      out.push({
        code: 'VAR15',
        severity: 'ERROR',
        path: p,
        message: `${v.id} has clinical categories but does not say where they come from. Quote the protocol, or name the standard (ISGPS, Clavien-Dindo, CDC, KDIGO...). A grade must never be left to the data collector's judgement.`,
      });
    }

    if (v.role === 'outcome_source' && !v.definition_reference) {
      out.push({
        code: 'VAR16',
        severity: 'WARN',
        path: p,
        message: `${v.id} measures an outcome but its definition is neither quoted from the protocol nor attributed to a standard.`,
      });
    }

    if (analysisVars.has(v.id) && (v.data_type === 'nominal' || v.data_type === 'ordinal')) {
      if (!v.reference_level) {
        out.push({
          code: 'VAR17',
          severity: 'ERROR',
          path: p,
          message: `${v.id} is a categorical predictor with no reference level, so every effect estimate would be uninterpretable.`,
        });
      } else if (!(v.categories || []).includes(v.reference_level)) {
        out.push({
          code: 'VAR17',
          severity: 'ERROR',
          path: p,
          message: `${v.id}'s reference level "${v.reference_level}" is not one of its categories.`,
        });
      }
    }
  });

  return out;
}

module.exports = { name, check };
