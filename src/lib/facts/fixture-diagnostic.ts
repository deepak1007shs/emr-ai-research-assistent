import type { FactsSheet } from "../study/types.ts";

/**
 * A diagnostic accuracy study with the shape of a real one.
 *
 * Invented, so that no real protocol is committed, and built to keep the
 * structure of the first real protocol through the rebuild - an MRI
 * measurement against histopathology - exactly: several index tests read on
 * the same people, a secondary that correlates them with a grade, a secondary
 * that compares their values between the reference results, several lesions
 * per participant, and exploratory questions of three kinds. Here it is
 * shear-wave elastography of thyroid nodules, read as absolute and as
 * normalised stiffness, against cytology.
 */

const measure = (
  name: string,
  label: string,
  type: FactsSheet["measures"][number]["type"],
  extra: Partial<FactsSheet["measures"][number]> = {},
): FactsSheet["measures"][number] => ({
  name, label, type, unit: null, options: null, block: null,
  derived_from: [], recipe: null, ...extra,
});

const chain = (
  what: string,
  type: FactsSheet["primary"]["type"],
  measures: string[],
): FactsSheet["primary"] => ({
  what,
  how: `${what}, against fine-needle aspiration cytology`,
  instrument: "shear-wave elastography",
  time: ["T0", "T1"],
  unit: type === "continuous" ? "kPa" : "Yes / No",
  type,
  distribution: "unknown",
  expected_frequency: null,
  competing_event: null,
  // Left as a comparison while the diagnostic branch still routes off the
  // design. The chain kind takes over from `facts.design` in its own change,
  // and this fixture is what proves the two agree before the switch.
  kind: "comparison",
  exposures: [],
  covariates: [],
  measures,
});

export const elastography: FactsSheet = {
  title:
    "Diagnostic accuracy of normalised shear-wave stiffness in differentiating benign from malignant thyroid nodules, with cytology as the reference standard",
  question_type: "association",
  unit_of_analysis: { unit: "nodule", repeats_within_participant: true },
  exposure_fixed_at_baseline: true,
  aim: "To evaluate normalised shear-wave stiffness in differentiating benign from malignant thyroid nodules.",
  hypothesis: null,
  population: {
    eligibility: "Adults with a thyroid nodule referred for fine-needle aspiration.",
    setting: "Department of Radiodiagnosis, a tertiary teaching hospital",
    short: "adults with a thyroid nodule",
    sampling: "Consecutive eligible patients",
  },
  intervention: "Shear-wave elastography of each nodule",
  comparator: "Fine-needle aspiration cytology",
  design: "diagnostic_accuracy",
  design_label: "prospective single-centre diagnostic accuracy study",
  guideline: "STARD",
  frame: "PECO",
  groups: [
    { code: "MALIGNANT", label: "Malignant on cytology" },
    { code: "BENIGN", label: "Benign on cytology" },
  ],
  allocation: { ratio: "", block: null, strata: [], matched: null },
  timepoints: ["T0", "T1"],
  measures: [
    measure("participant_id", "Participant ID", "text"),
    measure("age", "Age", "continuous", { unit: "years", block: "participant characteristics" }),
    measure("sex", "Sex", "nominal", { options: ["Male", "Female"], block: "participant characteristics" }),
    measure("family_history", "Family history of thyroid cancer", "binary", { options: ["Yes", "No"], block: "participant characteristics" }),
    measure("tsh", "Serum TSH", "continuous", { unit: "mIU/L", block: "participant characteristics" }),
    measure("tirads", "TI-RADS category", "ordinal", { options: ["1", "2", "3", "4", "5"], block: "ultrasound findings" }),
    measure("nodule_size", "Nodule size", "nominal", { options: ["Under 1 cm", "1 cm or more"], block: "ultrasound findings" }),
    measure("stiffness_mean", "Mean stiffness", "continuous", { unit: "kPa" }),
    measure("stiffness_max", "Maximum stiffness", "continuous", { unit: "kPa" }),
    measure("ratio_mean", "Normalised stiffness, mean", "continuous", { unit: "ratio" }),
    measure("ratio_max", "Normalised stiffness, maximum", "continuous", { unit: "ratio" }),
    measure("bethesda", "Bethesda category", "ordinal", { options: ["II", "III", "IV", "V", "VI"] }),
    // The target condition is a grade cut in two, as it nearly always is: the
    // real protocol's was a Gleason score, cut at clinical significance.
    measure("malignant", "Malignant on cytology", "binary", {
      options: ["Malignant", "Benign"],
      derived_from: ["bethesda"],
      recipe: "Bethesda category V or VI",
    }),
  ],
  visit_schedule: [
    {
      timepoint: "T0",
      label: "Elastography",
      measures: [
        "participant_id", "age", "sex", "family_history", "tsh", "tirads",
        "nodule_size", "stiffness_mean", "stiffness_max", "ratio_mean", "ratio_max",
      ],
    },
    { timepoint: "T1", label: "Cytology", measures: ["bethesda", "malignant"] },
  ],
  primary: chain(
    "Diagnostic performance of normalised stiffness in differentiating benign from malignant nodules",
    "binary",
    ["malignant", "ratio_mean", "ratio_max"],
  ),
  secondary: [
    chain(
      "Difference in diagnostic accuracy between normalised and absolute stiffness",
      "binary",
      ["malignant", "stiffness_mean", "ratio_mean"],
    ),
    chain(
      "Correlation of normalised stiffness with the Bethesda category",
      "ordinal",
      ["bethesda", "ratio_mean", "stiffness_mean"],
    ),
    chain(
      "Difference in absolute and normalised stiffness between benign and malignant nodules",
      "continuous",
      ["stiffness_mean", "stiffness_max", "ratio_mean", "malignant"],
    ),
  ],
  // The outcome each objective is about, and no factors. This study's chains
  // still route through the diagnostic branch by design rather than by kind,
  // so they carry no exposures, and naming factors here would assert something
  // the chains do not hold - which is what S1-5 exists to catch.
  stated_objectives: [
    {
      text: "To evaluate the diagnostic accuracy of normalised shear-wave stiffness in differentiating benign from malignant thyroid nodules",
      outcome: "malignant",
      factors: [],
      source: "objectives" as const,
    },
    {
      text: "To compare the diagnostic accuracy of normalised stiffness with that of absolute stiffness",
      outcome: "malignant",
      factors: [],
      source: "objectives" as const,
    },
    {
      text: "To correlate normalised stiffness with the Bethesda category",
      outcome: "bethesda",
      factors: [],
      source: "objectives" as const,
    },
    {
      text: "To compare absolute and normalised stiffness between benign and malignant nodules",
      outcome: "stiffness_mean",
      factors: [],
      source: "objectives" as const,
    },
  ],
  decisions: [],
  exploratory_ideas: [
    {
      question: "Does the accuracy of normalised stiffness differ by nodule size?",
      kind: "subgroup",
      outcome_of: "malignant",
      with: ["nodule_size"],
    },
    {
      question: "Do serum TSH or a family history relate to the cytology result?",
      kind: "correlation",
      outcome_of: "malignant",
      with: ["tsh", "ratio_mean", "family_history"],
    },
    {
      question: "Does normalised stiffness from maximum values perform differently from that from mean values?",
      kind: "derivation",
      outcome_of: "malignant",
      with: ["ratio_max", "ratio_mean"],
    },
  ],
  covariates: [
    { measure: "age", at: "T0", inferred: true },
    { measure: "tsh", at: "T0", inferred: true },
  ],
  proforma: [
    { item: "Participant ID", measure: "participant_id", keep: true, purpose: "administrative", reason: "Capture infrastructure" },
  ],
  sample_size: {
    per_group: 73,
    formula_family:
      "single-proportion precision formula for sensitivity and specificity (assumed sensitivity 0.85, specificity 0.90, prevalence 0.30)",
    verdict: "partial",
    attrition: null,
  },
  stated_rules: {
    software: "SPSS 26",
    alpha: "0.05",
    sided: "two",
    ci_level: "95%",
    missing_data: null,
    interim: null,
  },
  open_items: [],
};
