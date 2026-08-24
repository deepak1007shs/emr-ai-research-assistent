/*
 * Referential integrity and the terminology lock.
 *
 * REF01 — ids are unique across the whole spec
 * REF02 — every cross-reference resolves
 * VAR10 — no two objects share a label
 *
 * VAR10 is what delivers "no mismatch of a single line": a concept has exactly
 * one authoritative wording, stored once, printed by every artifact.
 */
'use strict';

const name = 'referential';

/** Every place one object names another, as [path, ids] pairs. */
function references(spec) {
  const refs = [];
  const push = (path, ids) => {
    for (const id of [].concat(ids || [])) if (id) refs.push([path, id]);
  };

  (spec.objectives || []).forEach((o, i) =>
    push(`objectives[${i}].outcome_ids`, o.outcome_ids));

  (spec.outcomes || []).forEach((o, i) => {
    push(`outcomes[${i}].timepoint_id`, o.timepoint_id);
    push(`outcomes[${i}].source_variable_ids`, o.source_variable_ids);
  });

  (spec.variables || []).forEach((v, i) => {
    push(`variables[${i}].derived_from`, v.derived_from);
    if (v.crf) push(`variables[${i}].crf.section_id`, v.crf.section_id);
  });

  (spec.analyses || []).forEach((a, i) => {
    push(`analyses[${i}].objective_id`, a.objective_id);
    push(`analyses[${i}].outcome_id`, a.outcome_id);
    push(`analyses[${i}].covariate_ids`, a.covariate_ids);
    push(`analyses[${i}].table_ids`, a.table_ids);
  });

  (spec.tables || []).forEach((t, i) => {
    push(`tables[${i}].row_variable_ids`, t.row_variable_ids);
    push(`tables[${i}].reference_rows`, t.reference_rows);
  });

  (spec.crf_sections || []).forEach((s, i) => {
    push(`crf_sections[${i}].parent_id`, s.parent_id);
    push(`crf_sections[${i}].timepoint_id`, s.timepoint_id);
  });

  const elg = spec.eligibility || {};
  for (const key of ['inclusion', 'exclusion']) {
    (elg[key] || []).forEach((c, i) => {
      push(`eligibility.${key}[${i}].variable_id`, c.variable_id);
      if (c.numeric) push(`eligibility.${key}[${i}].numeric.variable_id`, c.numeric.variable_id);
    });
  }

  if (spec.sample_size) {
    push('sample_size.powered_outcome_id', spec.sample_size.powered_outcome_id);
  }

  return refs;
}

function check(spec, ctx) {
  const out = [];

  for (const id of new Set(ctx.duplicateIds)) {
    out.push({
      code: 'REF01',
      severity: 'ERROR',
      path: id,
      message: `id "${id}" is used more than once. Every object needs its own id.`,
    });
  }

  for (const [path, id] of references(spec)) {
    if (!ctx.byId.has(id)) {
      out.push({
        code: 'REF02',
        severity: 'ERROR',
        path,
        message: `references "${id}", which does not exist. Add it, or correct the reference.`,
      });
    }
  }

  for (const dup of ctx.duplicateLabels) {
    out.push({
      code: 'VAR10',
      severity: 'ERROR',
      path: dup.kind,
      message: `the label "${dup.label}" is used by two objects. One concept has one wording — rename one, or merge them if they are the same thing.`,
    });
  }

  return out;
}

module.exports = { name, check };
