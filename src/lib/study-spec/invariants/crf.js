/*
 * The form itself — what a data collector sees at the bedside.
 *
 * Every rule here exists because of a form that produced unusable data: a
 * select with no options to tick, two fields numbered 4, a weight with no unit,
 * a date that came back as 05/06/2026 with nobody sure which was the month.
 *
 * CRF02 sections are numbered contiguously
 * CRF05 a select field lists what may be selected
 * CRF06 no two fields in a section share a number
 * CRF07 a multi-select says how it exports
 * CRF08 a number field carries its unit
 * CRF09 a date field carries its mask
 *
 * CRF01, CRF03 and CRF04 belong to referential.js and variables.js.
 */
'use strict';

const name = 'crf';

const SELECTS = new Set(['single_select', 'multi_select']);

function check(spec, ctx) {
  const out = [];
  const sections = spec.crf_sections || [];

  /* ---- CRF02: section numbering -------------------------------------- */

  const orders = sections.map((s) => s.order).sort((a, b) => a - b);
  const expected = orders.map((_, i) => i + 1);
  if (orders.some((o, i) => o !== expected[i])) {
    out.push({
      code: 'CRF02',
      severity: 'ERROR',
      path: 'crf_sections',
      message: `section order values are ${orders.join(', ')}; they must run ${expected.join(', ')}. A form whose sections skip a number reads as though a page is missing — renumber them.`,
    });
  }

  /* ---- CRF06: two fields with the same number ------------------------ */

  const seen = new Map();
  (spec.variables || []).forEach((v, i) => {
    if (!v.crf) return;
    const key = `${v.crf.section_id}#${v.crf.order}`;
    const first = seen.get(key);
    if (first) {
      const section = ctx.sections.get(v.crf.section_id);
      out.push({
        code: 'CRF06',
        severity: 'ERROR',
        path: `variables[${i}].crf.order`,
        message: `${v.id} and ${first} are both numbered ${v.crf.order} in ${section ? `"${section.title}"` : v.crf.section_id}. Two questions with the same S.No. cannot be referred to in a query or matched to a data column — renumber one.`,
      });
    } else {
      seen.set(key, v.id);
    }
  });

  /* ---- per field ------------------------------------------------------ */

  (spec.variables || []).forEach((v, i) => {
    const field = v.crf;
    if (!field) return;
    const p = `variables[${i}].crf`;

    if (SELECTS.has(field.field_type) && !(field.options || []).length) {
      out.push({
        code: 'CRF05',
        severity: 'ERROR',
        path: `${p}.options`,
        message: `${v.id} is a ${field.field_type.replace('_', '-')} field but lists no options, so the form prints a question with nothing to tick.${(v.categories || []).length ? ` Its variable already declares ${v.categories.length} categories — print those.` : ' List the choices.'}`,
      });
    }

    if (field.field_type === 'multi_select' && !field.export_note) {
      out.push({
        code: 'CRF07',
        severity: 'WARN',
        path: `${p}.export_note`,
        message: `${v.id} is a multi-select with no export note. Say that it exports as one binary column per option — a single column holding "A, C" cannot be analysed without being taken apart by hand.`,
      });
    }

    if (field.field_type === 'number' && !v.unit) {
      out.push({
        code: 'CRF08',
        severity: 'ERROR',
        path: `variables[${i}].unit`,
        message: `${v.id} is a number field but its variable states no unit, so the form asks for a bare number. Give it a unit and print it beside the box (kg, mmHg, days).`,
      });
    }

    if (field.field_type === 'date' && !field.mask) {
      out.push({
        code: 'CRF09',
        severity: 'ERROR',
        path: `${p}.mask`,
        message: `${v.id} is a date field with no mask. Print DD/MM/YYYY under the boxes — without it 05/06/2026 is two different dates and neither the collector nor the analyst can tell which.`,
      });
    }
  });

  return out;
}

module.exports = { name, check };
