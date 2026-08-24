/*
 * Shared derivation-chain helpers.
 *
 * A variable is either CAPTURED (has a `crf` block) or DERIVED (has
 * `derived_from`). Nothing is both, and nothing is neither. These helpers walk
 * from any variable down to the raw ingredients a form must actually collect.
 */
'use strict';

const isDerived = (v) => v && v.role === 'derived';
const isCaptured = (v) => Boolean(v && v.crf);

/**
 * Every captured variable a value ultimately rests on.
 * @returns {{ raw: string[], missing: string[], cycle: boolean }}
 */
function rawIngredients(varId, ctx, seen) {
  const visiting = seen || new Set();
  const result = { raw: [], missing: [], cycle: false };

  if (visiting.has(varId)) {
    result.cycle = true;
    return result;
  }
  visiting.add(varId);

  const v = ctx.variables.get(varId);
  if (!v) {
    result.missing.push(varId);
    return result;
  }

  if (!isDerived(v)) {
    if (isCaptured(v)) result.raw.push(varId);
    else result.missing.push(varId);
    return result;
  }

  for (const parent of v.derived_from || []) {
    const sub = rawIngredients(parent, ctx, visiting);
    result.raw.push(...sub.raw);
    result.missing.push(...sub.missing);
    result.cycle = result.cycle || sub.cycle;
  }

  visiting.delete(varId);
  return result;
}

/** Degrees of freedom a variable contributes to a model. */
function degreesOfFreedom(v) {
  if (!v) return 1;
  if (v.data_type === 'nominal' || v.data_type === 'ordinal') {
    return Math.max(1, (v.categories || []).length - 1);
  }
  return 1;
}

/** Categories that look like numeric ranges — "50-65", "<50", ">= 70". */
function looksLikeBand(categories) {
  const list = categories || [];
  if (list.length < 2) return false;
  const rangey = list.filter((c) =>
    /^\s*[<>≤≥]?\s*\d+(\.\d+)?\s*(–|-|to)\s*\d+/.test(c) ||
    /^\s*[<>≤≥]=?\s*\d+(\.\d+)?\s*$/.test(c),
  );
  return rangey.length >= Math.ceil(list.length / 2);
}

module.exports = { isDerived, isCaptured, rawIngredients, degreesOfFreedom, looksLikeBand };
