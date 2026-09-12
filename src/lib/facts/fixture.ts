import type { FactsSheet } from "../study/types.ts";

/**
 * IDA-PREG, the dummy study the written process carries through every step.
 *
 * It is invented. Its facts exist only to exercise the pipeline, and the
 * process chose it because it reaches most branches: a randomised design, so
 * analysis populations matter; an outcome measured four times, so the level and
 * shape split applies; a binary secondary, so the frequency rule applies; a
 * skewed secondary, so the log-scale branch applies; safety outcomes, which are
 * reported and not modelled; and an idea that sits only in the hypothesis, so
 * promotion applies.
 *
 * This is the build's acceptance test. Appendix B of the process gives the
 * sixteen tables it must produce and Appendix C the fields its form must
 * carry, and running the pipeline twice over this must give one document.
 */
export const idaPreg: FactsSheet = {
  title:
    "Intravenous ferric carboxymaltose versus oral ferrous ascorbate for the rise in haemoglobin in pregnant women with iron-deficiency anaemia: a randomised controlled trial",
  question_type: "effect",
  unit_of_analysis: { unit: "participant", repeats_within_participant: false },
  exposure_fixed_at_baseline: true,
  aim: "To compare intravenous ferric carboxymaltose with oral ferrous ascorbate for the correction of iron-deficiency anaemia in pregnancy.",
  hypothesis:
    "A single infusion of ferric carboxymaltose raises haemoglobin faster and further than six weeks of oral iron, and the difference is larger in women on a vegetarian diet.",
  population: {
    eligibility:
      "Pregnant women at 20 to 28 weeks' gestation with iron-deficiency anaemia (haemoglobin 7.0 to 9.9 g/dL and serum ferritin below 30 ng/mL). Excluded: anaemia not due to iron deficiency, known haemoglobinopathy, transfusion in the last three months, known iron allergy, chronic kidney or liver disease.",
    setting: "Department of Obstetrics and Gynaecology, a tertiary teaching hospital",
    short: "pregnant women with iron-deficiency anaemia",
    sampling: "Consecutive eligible women",
  },
  intervention:
    "Intravenous ferric carboxymaltose 1000 mg, a single infusion on day 0",
  comparator:
    "Oral ferrous ascorbate, 100 mg elemental iron twice daily for six weeks",
  design: "randomised_trial",
  design_label:
    "two-arm parallel-group open-label active-controlled superiority randomised controlled trial",
  guideline: "CONSORT (protocol: SPIRIT)",
  frame: "PICO",
  groups: [
    { code: "FCM", label: "IV ferric carboxymaltose" },
    { code: "Oral", label: "Oral ferrous ascorbate" },
  ],
  allocation: { ratio: "1:1", block: 4, strata: [], matched: null },
  timepoints: ["D0", "W2", "W4", "W6"],
  measures: [
    { name: "participant_name", label: "Name", type: "text", unit: null, options: null, block: null, derived_from: [], recipe: null },
    { name: "hospital_number", label: "Hospital number", type: "text", unit: null, options: null, block: null, derived_from: [], recipe: null },
    { name: "age", label: "Age", type: "continuous", unit: "years", options: null, block: "demographic and obstetric characteristics", derived_from: [], recipe: null },
    { name: "residence", label: "Residence", type: "nominal", unit: null, options: ["Urban", "Rural"], block: "demographic and obstetric characteristics", derived_from: [], recipe: null },
    { name: "gravidity", label: "Gravidity", type: "count", unit: "pregnancies", options: null, block: "demographic and obstetric characteristics", derived_from: [], recipe: null },
    { name: "parity", label: "Parity", type: "count", unit: "births", options: null, block: "demographic and obstetric characteristics", derived_from: [], recipe: null },
    { name: "gestational_age", label: "Gestational age", type: "continuous", unit: "weeks", options: null, block: "demographic and obstetric characteristics", derived_from: [], recipe: null },
    { name: "height", label: "Height", type: "continuous", unit: "cm", options: null, block: "demographic and obstetric characteristics", derived_from: [], recipe: null },
    { name: "weight", label: "Weight", type: "continuous", unit: "kg", options: null, block: "demographic and obstetric characteristics", derived_from: [], recipe: null },
    { name: "diet", label: "Dietary pattern", type: "nominal", unit: null, options: ["Vegetarian", "Mixed", "Non-vegetarian"], block: "demographic and obstetric characteristics", derived_from: [], recipe: null },
    { name: "haemoglobin", label: "Haemoglobin", type: "continuous", unit: "g/dL", options: null, block: "haematological and iron profile", derived_from: [], recipe: null },
    { name: "serum_ferritin", label: "Serum ferritin", type: "continuous", unit: "ng/mL", options: null, block: "haematological and iron profile", derived_from: [], recipe: null },
    { name: "mean_corpuscular_volume", label: "Mean corpuscular volume", type: "continuous", unit: "fL", options: null, block: "haematological and iron profile", derived_from: [], recipe: null },
    { name: "adverse_effects", label: "Any adverse effect since the last visit", type: "binary", unit: null, options: ["Yes", "No"], block: null, derived_from: [], recipe: null },
    { name: "adherence", label: "Doses taken since the last visit", type: "continuous", unit: "% of doses", options: null, block: null, derived_from: [], recipe: null },
    // Written on no form and carried by Table 1, which is the whole reason a
    // measure may be derived.
    { name: "bmi", label: "Body mass index", type: "continuous", unit: "kg/m2", options: null, block: "demographic and obstetric characteristics", derived_from: ["height", "weight"], recipe: "Weight in kilograms divided by height in metres squared" },
  ],
  visit_schedule: [
    {
      timepoint: "D0",
      label: "Day 0",
      measures: [
        "participant_name", "hospital_number", "age", "residence", "gravidity",
        "parity", "gestational_age", "height", "weight",
        "haemoglobin", "serum_ferritin", "mean_corpuscular_volume",
      ],
    },
    { timepoint: "W2", label: "Week 2", measures: ["haemoglobin", "adverse_effects", "adherence"] },
    { timepoint: "W4", label: "Week 4", measures: ["haemoglobin", "adverse_effects", "adherence"] },
    {
      timepoint: "W6",
      label: "Week 6",
      measures: ["haemoglobin", "serum_ferritin", "adverse_effects", "adherence"],
    },
  ],
  primary: {
    what: "Change in haemoglobin",
    how: "Haemoglobin at week 6 minus haemoglobin at day 0",
    instrument: "automated laboratory analyser",
    time: ["D0", "W2", "W4", "W6"],
    unit: "g/dL",
    type: "continuous",
    distribution: "normal",
    expected_frequency: null,
    competing_event: null,
    kind: "comparison",
    exposures: [],
    measures: ["haemoglobin"],
  },
  secondary: [
    {
      what: "Anaemia corrected",
      how: "Haemoglobin of 11.0 g/dL or above at week 6",
      instrument: "automated laboratory analyser",
      time: ["W6"],
      unit: "Yes / No",
      type: "binary",
      distribution: "unknown",
      expected_frequency: null,
      competing_event: null,
      kind: "comparison",
      exposures: [],
      measures: ["haemoglobin"],
    },
    {
      what: "Change in serum ferritin",
      how: "Serum ferritin at week 6 minus serum ferritin at day 0",
      instrument: "immunoassay",
      time: ["D0", "W6"],
      unit: "ng/mL",
      type: "continuous",
      // Ferritin is right-skewed in every population it is measured in, and
      // that is known before the first sample is drawn.
      distribution: "skewed",
      expected_frequency: null,
      competing_event: null,
      kind: "comparison",
      exposures: [],
      measures: ["serum_ferritin"],
    },
    {
      what: "Adverse effects",
      how: "Each adverse effect recorded as present or absent since the last visit",
      instrument: "structured questioning at each visit",
      time: ["W2", "W4", "W6"],
      unit: "Yes / No",
      type: "binary",
      distribution: "unknown",
      expected_frequency: null,
      competing_event: null,
      kind: "comparison",
      exposures: [],
      measures: ["adverse_effects"],
    },
  ],
  exploratory_ideas: [
    {
      question:
        "Does the effect on haemoglobin differ by gestational age at enrolment?",
      kind: "subgroup",
      outcome_of: "change_in_haemoglobin",
      with: ["gestational_age"],
    },
    {
      question:
        "Is baseline serum ferritin correlated with the change in haemoglobin?",
      kind: "correlation",
      outcome_of: "change_in_haemoglobin",
      with: ["serum_ferritin"],
    },
    {
      // Dietary pattern is named in the hypothesis and appears in no visit of
      // the schedule. The protocol asks a question about something it never
      // collects, which is the commonest way a thesis loses an analysis.
      question:
        "Does the effect on haemoglobin differ by dietary pattern?",
      kind: "subgroup",
      outcome_of: "change_in_haemoglobin",
      with: ["diet"],
    },
  ],
  covariates: [
    { measure: "haemoglobin", at: "D0", inferred: false },
    { measure: "gestational_age", at: "D0", inferred: true },
  ],
  proforma: [
    { item: "Name", measure: "participant_name", keep: true, purpose: "administrative", reason: "Capture infrastructure" },
    { item: "Hospital number", measure: "hospital_number", keep: true, purpose: "administrative", reason: "Capture infrastructure" },
    { item: "Age", measure: "age", keep: true, purpose: "descriptor", reason: "Descriptor: who the results apply to" },
    { item: "Residence", measure: "residence", keep: true, purpose: "descriptor", reason: "Descriptor" },
    { item: "Education", measure: null, keep: false, purpose: null, reason: "Serves no objective" },
    { item: "Husband's occupation", measure: null, keep: false, purpose: null, reason: "Serves no objective" },
    { item: "Blood group", measure: null, keep: false, purpose: null, reason: "Serves no objective" },
    { item: "Gravidity", measure: "gravidity", keep: true, purpose: "descriptor", reason: "Descriptor" },
    { item: "Parity", measure: "parity", keep: true, purpose: "descriptor", reason: "Descriptor" },
    { item: "Gestational age", measure: "gestational_age", keep: true, purpose: "descriptor", reason: "Covariate of the adjusted primary model" },
    { item: "Height", measure: "height", keep: true, purpose: "input", reason: "Raw input of body mass index" },
    { item: "Weight", measure: "weight", keep: true, purpose: "input", reason: "Raw input of body mass index" },
    { item: "Blood pressure", measure: null, keep: false, purpose: null, reason: "Serves no objective" },
    { item: "Stool for ova and cysts", measure: null, keep: false, purpose: null, reason: "Serves no objective" },
    { item: "Adherence by pill count", measure: "adherence", keep: true, purpose: "population", reason: "Defines the per-protocol set" },
  ],
  sample_size: {
    per_group: 60,
    formula_family: "two-mean power formula",
    verdict: "partial",
    attrition: null,
  },
  stated_rules: {
    // The protocol names SPSS and not its version, sets no alpha, and says
    // nothing at all about missing data. That is the usual state of a thesis
    // protocol, and it is what Step 5's defaults and TODOs exist for.
    software: null,
    alpha: null,
    sided: null,
    ci_level: null,
    missing_data: null,
    interim: null,
  },
  open_items: [
    "SPSS version",
    "Expected proportion reaching haemoglobin of 11.0 g/dL or above, needed to confirm the risk-ratio model",
    "Gestational-age cut-off for the subgroup analysis; 24 weeks proposed",
    "Confirm gestational age as a covariate: it was inferred, not named in the protocol",
  ],
};
