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

  // --- design
  { code: 'STU02', why: 'a randomised trial that never says who was blinded',
    mutate: (s) => { delete s.study.design_detail.blinding; return s; } },
  { code: 'STU03', why: 'an allocated intervention framed as an observed exposure',
    mutate: (s) => { s.study.framework = 'PECO'; return s; } },
  { code: 'STU04', why: 'a randomised trial reported under STROBE',
    mutate: (s) => { s.study.guideline = 'STROBE'; return s; } },
  { code: 'STU05', why: 'a design family nothing here can render',
    mutate: (s) => { s.study.design = 'qualitative'; s.study.guideline = 'COREQ'; return s; } },

  // --- structure
  { code: 'POP01', why: 'a trial that never says who is analysed',
    mutate: (s) => { delete s.populations; return s; } },
  { code: 'POP02', why: 'no population carries the primary analysis',
    mutate: (s) => { s.populations[0].primary = false; return s; } },
  { code: 'ELG01', why: 'no exclusion criteria at all',
    mutate: (s) => { s.eligibility.exclusion = []; return s; } },
  { code: 'ELG02', why: 'ASA III included by nothing and excluded by nothing',
    mutate: (s) => { s.eligibility.exclusion[0].numeric.min = 4; return s; } },
  { code: 'TP01', why: 'a visit with no window around it',
    mutate: (s) => { delete s.timepoints[0].window; return s; } },
  { code: 'TP02', why: 'a gap in the visit numbering',
    mutate: (s) => { s.timepoints[3].order = 5; return s; } },
  { code: 'GDL01', why: 'a CONSORT trial with no screening log to count from',
    mutate: (s) => { variable(s, 'var_screening_outcome').label = 'Enrolment outcome'; return s; } },

  // --- sample size
  { code: 'SS01', why: 'the study is powered for something other than its primary outcome',
    mutate: (s) => { s.sample_size.powered_outcome_id = 'out_los'; return s; } },
  { code: 'SS02', why: 'two outcomes both claimed as powered',
    mutate: (s) => { s.sample_size.powered_outcome_id = ['out_complication', 'out_los']; return s; } },
  { code: 'SS03', why: 'an n that does not follow from its own inputs',
    mutate: (s) => { s.sample_size.n_per_group = 60; s.sample_size.n_total = 120; return s; } },
  { code: 'SS04', why: 'an assumed proportion with no provenance',
    mutate: (s) => { delete s.sample_size.inputs[0].source; return s; } },
  { code: 'SS05', why: 'no allowance for loss to follow-up',
    mutate: (s) => {
      delete s.sample_size.attrition;
      s.sample_size.n_per_group = 81;
      s.sample_size.n_total = 162;
      return s;
    } },

  // --- adjustment
  { code: 'ADJ02', why: 'the model adjusts away the mechanism it is measuring',
    mutate: (s) => { variable(s, 'var_age').role = 'mediator'; return s; } },
  { code: 'ADJ03', why: 'the model conditions on a collider',
    mutate: (s) => { variable(s, 'var_age').role = 'collider'; return s; } },
  { code: 'ADJ04', why: 'the model adjusts for its own exposure',
    mutate: (s) => { s.analyses[0].covariate_ids.push('var_group'); return s; } },
  { code: 'ADJ05', why: 'more degrees of freedom than the events can carry',
    mutate: (s) => { s.analyses[0].covariate_ids.push('var_asa_numeric'); return s; } },
  { code: 'ADJ06', why: 'a categorical covariate whose degrees of freedom cannot be counted',
    mutate: (s) => { delete variable(s, 'var_sex').categories; return s; } },
  { code: 'ADJ07', why: 'a covariate the form never collects',
    mutate: (s) => { delete variable(s, 'var_age').crf; return s; } },

  // --- tests and models
  { code: 'TEST01', why: 'a t-test on a binary outcome',
    mutate: (s) => { s.analyses[0].unadjusted_test = 't_test'; return s; } },
  { code: 'TEST02', why: 'paired data handed to an unpaired test',
    mutate: (s) => { s.analyses[0].paired = true; return s; } },
  { code: 'TEST03', why: 'a linear model fitted to a binary outcome',
    mutate: (s) => {
      s.analyses[0].adjusted_model = 'linear';
      s.analyses[0].effect_measure = 'mean_difference';
      return s;
    } },
  { code: 'TEST04', why: 'an odds ratio claimed from a log-binomial model',
    mutate: (s) => { s.analyses[0].effect_measure = 'odds_ratio'; return s; } },
  { code: 'TEST05', why: 'a case-control study claiming a risk ratio',
    mutate: (s) => {
      s.study.design = 'case_control';
      s.study.guideline = 'STROBE';
      s.study.framework = 'PECO';
      s.study.design_detail.matching_variables = 'Age within 5 years, sex';
      s.study.design_detail.matching_ratio = '1:2';
      return s;
    } },
  { code: 'TEST06', why: 'an odds ratio for an outcome half the participants will have',
    mutate: (s) => {
      s.analyses[0].adjusted_model = 'logistic';
      s.analyses[0].effect_measure = 'odds_ratio';
      return s;
    } },
  { code: 'SURV01', why: 'a Cox model with no proportional-hazards check',
    mutate: (s) => {
      s.outcomes[1].data_type = 'time_to_event';
      s.outcomes[1].summary_statistic = 'median survival';
      s.analyses[1].unadjusted_test = 'log_rank';
      s.analyses[1].adjusted_model = 'cox';
      s.analyses[1].effect_measure = 'hazard_ratio';
      // A censoring variable, so this trips SURV01 alone and not SURV02.
      s.variables.push({
        id: 'var_discharge_status', label: 'Discharge status at day 30', role: 'censoring',
        data_type: 'binary', subtype: 'yes/no',
        categories: ['Discharged alive', 'Still in hospital or died'],
        reference_level: 'Still in hospital or died',
        definition_source: 'protocol',
        definition_reference: 'Whether the participant had been discharged alive by day 30',
        crf: {
          section_id: 'sec_followup_d30', order: 3, field_type: 'single_select',
          response: 'Discharged alive / Still in hospital or died',
          options: ['Discharged alive', 'Still in hospital or died'],
        },
      });
      return s;
    } },
  { code: 'SURV02', why: 'time to an event with nothing recording censoring',
    mutate: (s) => {
      s.outcomes[1].data_type = 'time_to_event';
      s.outcomes[1].summary_statistic = 'median survival';
      s.analyses[1].unadjusted_test = 'log_rank';
      return s;
    } },

  // --- tables
  { code: 'TBL01', why: 'a gap in the table numbering',
    mutate: (s) => { s.tables[4].number = 6; return s; } },
  { code: 'TBL02', why: 'the primary table printed among the exploratory ones',
    mutate: (s) => { s.tables[1].block = 'exploratory'; return s; } },
  { code: 'TBL03', why: 'a table with nothing to print in it',
    mutate: (s) => { s.tables[0].row_variable_ids = []; return s; } },
  { code: 'TBL04', why: 'a sensitivity analysis printed before the exploratory results',
    mutate: (s) => { s.tables[3].number = 5; s.tables[4].number = 4; return s; } },
  { code: 'TBL05', why: 'a family of two analyses with no multiplicity position',
    mutate: (s) => {
      s.analyses.push({
        id: 'ana_anxiety_baseline', objective_id: 'obj_exploratory_anxiety',
        outcome_id: 'out_anxiety', unadjusted_test: 'mann_whitney',
        table_ids: ['tbl_exploratory'], paired: false,
      });
      return s;
    } },
  { code: 'TBL06', why: 'a P value with no named test',
    mutate: (s) => { delete s.tables[2].test_applied; return s; } },
  { code: 'TBL07', why: 'a column called Model 2',
    mutate: (s) => { s.tables[1].columns.push('Model 2'); return s; } },
  { code: 'TBL08', why: 'an adjusted estimate with nothing crude to compare it with',
    mutate: (s) => { s.tables[1].columns[3] = 'RR (95% CI)'; return s; } },
  { code: 'TBL09', why: 'an effect estimate with no interval',
    mutate: (s) => { s.tables[1].columns[4] = 'Adjusted RR'; return s; } },
  { code: 'TBL10', why: 'a categorical comparison with no reference level marked',
    mutate: (s) => { s.tables[1].reference_rows = []; return s; } },

  // --- the form
  { code: 'CRF02', why: 'a gap in the section numbering',
    mutate: (s) => { s.crf_sections[5].order = 7; return s; } },
  { code: 'CRF05', why: 'a select field with nothing to tick',
    mutate: (s) => { delete variable(s, 'var_sex').crf.options; return s; } },
  { code: 'CRF06', why: 'two questions numbered the same',
    mutate: (s) => { variable(s, 'var_sex').crf.order = 1; return s; } },
  { code: 'CRF07', why: 'a multi-select with no export rule',
    mutate: (s) => { variable(s, 'var_sex').crf.field_type = 'multi_select'; return s; } },
  { code: 'CRF08', why: 'a number field asking for a bare number',
    mutate: (s) => { delete variable(s, 'var_age').unit; return s; } },
  { code: 'CRF09', why: 'a date field with no mask',
    mutate: (s) => { delete variable(s, 'var_date_surgery').crf.mask; return s; } },
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
