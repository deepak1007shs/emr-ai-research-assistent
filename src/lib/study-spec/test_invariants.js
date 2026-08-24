/*
 * test_invariants.js — the mutation harness
 *
 * Breaks the clean example spec once per guard and asserts that guard fires.
 * A mutation that stops failing means a guard has rotted, which is exactly the
 * failure a test suite is supposed to catch.
 *
 * ZERO DEPENDENCIES. Run standalone:  node test_invariants.js
 */
'use strict';

const path = require('path');
const { validate } = require('./validate_study_spec');
const EXAMPLE = require('./example_study_spec.json');

const clone = () => JSON.parse(JSON.stringify(EXAMPLE));
const variable = (s, id) => s.variables.find((v) => v.id === id);

/** Each mutation makes the smallest change that should trip exactly its code. */
const MUTATIONS = [
  // --- referential
  { code: 'REF01', why: 'two objects share an id',
    mutate: (s) => { s.variables[1].id = s.variables[0].id; return s; } },
  { code: 'REF02', why: 'a reference points at nothing',
    mutate: (s) => { s.analyses[0].covariate_ids.push('var_does_not_exist'); return s; } },
  { code: 'VAR10', why: 'one concept given two identities',
    mutate: (s) => { s.variables[1].label = s.variables[0].label; return s; } },

  // --- objectives
  { code: 'OBJ01', why: 'two primary objectives',
    mutate: (s) => { s.objectives[1].tier = 'primary'; s.outcomes[1].tier = 'primary'; return s; } },
  { code: 'OBJ02', why: 'an objective with no outcome',
    mutate: (s) => { s.objectives[2].outcome_ids = []; return s; } },
  { code: 'OBJ03', why: 'objective and outcome tiers disagree',
    mutate: (s) => { s.outcomes[1].tier = 'exploratory'; return s; } },
  { code: 'OBJ04', why: 'an orphan outcome',
    mutate: (s) => { s.objectives[2].outcome_ids = ['out_los']; return s; } },
  { code: 'OBJ05', why: 'the estimand omits the intercurrent-event strategy',
    mutate: (s) => { delete s.objectives[0].estimand.intercurrent_event_strategy; return s; } },
  { code: 'OBJ06', why: 'non-inferiority with no margin',
    mutate: (s) => { s.objectives[1].comparison_type = 'non_inferiority'; return s; } },

  // --- outcomes
  { code: 'OUT01', why: 'no primary outcome',
    mutate: (s) => { s.outcomes[0].tier = 'secondary'; s.objectives[0].tier = 'secondary'; return s; } },
  { code: 'OUT02', why: 'an outcome nobody analyses',
    mutate: (s) => { s.analyses = s.analyses.filter((a) => a.outcome_id !== 'out_anxiety'); return s; } },
  { code: 'OUT03', why: 'a continuous outcome with no unit',
    mutate: (s) => { delete s.outcomes[1].unit; return s; } },
  { code: 'OUT06', why: 'no summary statistic',
    mutate: (s) => { delete s.outcomes[1].summary_statistic; return s; } },
  { code: 'OUT07', why: 'an outcome with no source variable',
    mutate: (s) => { s.outcomes[1].source_variable_ids = []; return s; } },
  { code: 'OUT08', why: 'the chain never reaches collected data',
    mutate: (s) => { delete variable(s, 'var_date_discharge').crf; return s; } },
  { code: 'OUT09', why: 'a mean of a binary outcome',
    mutate: (s) => { s.outcomes[0].summary_statistic = 'mean (SD)'; return s; } },

  // --- variables
  { code: 'VAR01', why: 'a variable nothing uses',
    mutate: (s) => {
      s.variables.push({ id: 'var_orphan', label: 'Orphan measurement', role: 'covariate',
        data_type: 'continuous', subtype: 'ratio scale', unit: 'mm',
        crf: { section_id: 'sec_demographics', order: 9, field_type: 'number', response: '________ mm' } });
      return s;
    } },
  { code: 'VAR04', why: 'a derived variable that says nothing about its derivation',
    mutate: (s) => { delete variable(s, 'var_length_of_stay').derivation; return s; } },
  { code: 'VAR05', why: 'a computed value given a box to fill in',
    mutate: (s) => {
      variable(s, 'var_length_of_stay').crf = {
        section_id: 'sec_followup_d30', order: 9, field_type: 'number', response: '________ days' };
      return s;
    } },
  { code: 'VAR07', why: 'a derivation whose ingredients are never collected',
    mutate: (s) => { variable(s, 'var_length_of_stay').derived_from = ['var_gad7_total', 'var_date_surgery']; 
      delete variable(s, 'var_gad7_item1').crf; return s; } },
  { code: 'VAR08', why: 'a derivation that refers back to itself',
    mutate: (s) => { variable(s, 'var_length_of_stay').derived_from = ['var_length_of_stay']; return s; } },
  { code: 'VAR09', why: 'a categorical variable with no levels',
    mutate: (s) => { variable(s, 'var_sex').categories = []; return s; } },
  { code: 'VAR11', why: 'a band whose source is not a captured number',
    mutate: (s) => {
      const v = variable(s, 'var_complication_binary');
      v.derivation_kind = 'band';
      return s;
    } },
  { code: 'VAR12', why: 'an age band collected instead of the age',
    mutate: (s) => {
      s.variables.push({ id: 'var_age_band', label: 'Age band', role: 'covariate',
        data_type: 'nominal', subtype: 'three-level band',
        categories: ['<50', '50-65', '>65'], reference_level: '<50',
        definition_source: 'protocol', definition_reference: 'Age bands as per protocol',
        crf: { section_id: 'sec_demographics', order: 8, field_type: 'single_select',
          response: '<50 / 50-65 / >65', options: ['<50', '50-65', '>65'] } });
      s.analyses[0].covariate_ids.push('var_age_band');
      return s;
    } },
  { code: 'VAR13', why: 'a score whose items are not collected',
    mutate: (s) => { delete variable(s, 'var_gad7_item1').crf; return s; } },
  { code: 'VAR14', why: 'a variable with no subtype',
    mutate: (s) => { delete variable(s, 'var_age').subtype; return s; } },
  { code: 'VAR15', why: 'clinical categories with no stated source',
    mutate: (s) => { delete variable(s, 'var_clavien_grade').definition_reference; return s; } },
  { code: 'VAR16', why: 'an outcome variable with no definition at all',
    mutate: (s) => { delete variable(s, 'var_date_surgery').definition_reference; return s; } },
  { code: 'VAR17', why: 'a categorical predictor with no reference level',
    mutate: (s) => { delete variable(s, 'var_sex').reference_level; return s; } },
];

/** Every code the harness covers, for the coverage test. */
const COVERED = MUTATIONS.map((m) => m.code);

function run() {
  let failures = 0;
  for (const m of MUTATIONS) {
    const { findings } = validate(m.mutate(clone()));
    const fired = findings.some((f) => f.code === m.code);
    if (!fired) {
      failures += 1;
      console.error(`FAIL  ${m.code}  did not fire when ${m.why}`);
    }
  }
  const clean = validate(EXAMPLE, { final: true });
  if (!clean.ok) {
    failures += 1;
    console.error('FAIL  the unmutated example spec does not pass --final');
    for (const f of clean.findings) console.error(`      ${f.code} ${f.path}: ${f.message}`);
  }
  console.error(
    failures === 0
      ? `PASS  ${MUTATIONS.length} guards fire on their mutations`
      : `FAIL  ${failures} problem(s)`,
  );
  return failures === 0 ? 0 : 1;
}

module.exports = { MUTATIONS, COVERED, run };

if (require.main === module) process.exit(run());
