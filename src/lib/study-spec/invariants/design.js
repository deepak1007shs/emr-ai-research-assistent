/*
 * The design — and, above all, whether this application can honour it.
 *
 * STU05 is the guard that matters most. A family with no renderer must be
 * refused outright: a half-right SAP for a diagnostic accuracy study is worse
 * than no SAP, because it looks finished.
 *
 * STU02 design_detail carries what its family requires
 * STU03 the framework matches an interventional or observational question
 * STU04 the reporting guideline matches the design
 * STU05 the design family has a renderer
 */
'use strict';

const name = 'design';

/** Design families this application renders today. */
const RENDERED = [
  /^rct_/, 'non_randomised_trial', 'single_arm', 'before_after',
  /^cohort_/, /^case_control/, 'case_cohort', /^cross_sectional_/, 'case_series',
];

const INTERVENTIONAL = [
  /^rct_/, 'n_of_1', 'non_randomised_trial', 'single_arm', 'before_after',
];

const OBSERVATIONAL = [
  /^cohort_/, /^case_control/, 'case_cohort', /^cross_sectional_/,
  'case_report', 'case_series', 'ecological', 'case_crossover',
  'self_controlled_case_series', 'interrupted_time_series',
];

/** design_detail keys each family cannot be written without. */
const REQUIRED_DETAIL = [
  [/^case_control/, ['matching_variables', 'matching_ratio']],
  ['rct_cluster', ['icc', 'average_cluster_size', 'unit_of_allocation']],
  ['rct_crossover', ['washout', 'periods']],
  [/^cohort_/, ['follow_up_schedule', 'censoring_rule']],
  [/^rct_/, ['sequence_generation', 'allocation_concealment', 'blinding']],
  ['diagnostic_accuracy', ['index_test', 'reference_standard']],
  ['rct_non_inferiority', ['margin']],
];

/** The guideline each family reports under. */
const GUIDELINES = [
  [/^rct_/, ['CONSORT']],
  [/^cohort_/, ['STROBE']],
  [/^case_control/, ['STROBE']],
  [/^cross_sectional_/, ['STROBE']],
  ['diagnostic_accuracy', ['STARD']],
  ['prognostic_model', ['TRIPOD']],
  ['qualitative', ['COREQ', 'SRQR']],
  ['systematic_review', ['PRISMA']],
];

const matches = (design, pattern) =>
  pattern instanceof RegExp ? pattern.test(design) : pattern === design;

const isRendered = (design) => RENDERED.some((p) => matches(design, p));
const isInterventional = (design) => INTERVENTIONAL.some((p) => matches(design, p));
const isObservational = (design) => OBSERVATIONAL.some((p) => matches(design, p));

function check(spec) {
  const out = [];
  const study = spec.study || {};
  const design = study.design;
  if (!design) return out;
  const spoken = design.replace(/_/g, ' ');

  /* ---- STU05: is there a renderer at all? ---------------------------- */

  if (!isRendered(design)) {
    out.push({
      code: 'STU05',
      severity: 'ERROR',
      path: 'study.design',
      message: `${design} is not a design this application renders yet. A ${spoken} study needs sections and tables that do not exist here, and a document that is half right reads as though it were finished. Use one of the supported families (any rct_*, non_randomised_trial, single_arm, before_after, cohort_*, case_control*, case_cohort, cross_sectional_*, case_series), or write this protocol's SAP by hand.`,
    });
  }

  /* ---- STU02: the detail the family cannot be written without -------- */

  const detail = study.design_detail || {};
  const needed = new Set();
  for (const [pattern, keys] of REQUIRED_DETAIL) {
    if (matches(design, pattern)) for (const key of keys) needed.add(key);
  }
  const missing = [...needed].filter((key) => detail[key] === undefined || detail[key] === '');
  if (missing.length) {
    out.push({
      code: 'STU02',
      severity: 'ERROR',
      path: 'study.design_detail',
      message: `a ${spoken} study must state ${missing.join(', ')} in design_detail, and this one does not. Without it the methods section cannot be written and the design cannot be appraised.`,
    });
  }

  /* ---- STU03: the question's framework ------------------------------- */

  if (isInterventional(design) && study.framework === 'PECO') {
    out.push({
      code: 'STU03',
      severity: 'ERROR',
      path: 'study.framework',
      message: `${design} allocates an intervention, so the question is PICO, not PECO. PECO frames an exposure the investigator observes rather than assigns — change the framework to PICO, or change the design.`,
    });
  }
  if (isObservational(design) && study.framework === 'PICO') {
    out.push({
      code: 'STU03',
      severity: 'ERROR',
      path: 'study.framework',
      message: `${design} observes an exposure rather than assigning it, so the question is PECO, not PICO. Calling it an intervention invites a causal claim the design cannot support.`,
    });
  }

  /* ---- STU04: the reporting guideline -------------------------------- */

  for (const [pattern, allowed] of GUIDELINES) {
    if (!matches(design, pattern)) continue;
    if (!allowed.includes(study.guideline)) {
      out.push({
        code: 'STU04',
        severity: 'ERROR',
        path: 'study.guideline',
        message: `a ${spoken} study reports under ${allowed.join(' or ')}, but this spec names ${study.guideline}. The checklist decides which items the protocol and the SAP must carry — set guideline to ${allowed[0]}.`,
      });
    }
    break;
  }

  return out;
}

module.exports = { name, check, isInterventional, isObservational, isRendered };
