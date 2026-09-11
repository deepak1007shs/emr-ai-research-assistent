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
  design: "randomised_trial",
  design_label:
    "two-arm parallel-group open-label active-controlled superiority randomised controlled trial",
  guideline: "CONSORT (protocol: SPIRIT)",
  frame: "PICO",
  groups: [
    { code: "FCM", label: "IV ferric carboxymaltose" },
    { code: "ORAL", label: "Oral ferrous ascorbate" },
  ],
  allocation: { ratio: "1:1", block: 4, strata: [] },
  timepoints: ["D0", "W2", "W4", "W6"],
  visit_schedule: [
    {
      timepoint: "D0",
      measures: [
        "haemoglobin", "serum ferritin", "mean corpuscular volume",
        "gestational age", "height", "weight", "diet",
      ],
    },
    { timepoint: "W2", measures: ["haemoglobin", "adverse effects", "adherence"] },
    { timepoint: "W4", measures: ["haemoglobin", "adverse effects", "adherence"] },
    {
      timepoint: "W6",
      measures: ["haemoglobin", "serum ferritin", "adverse effects", "adherence"],
    },
  ],
  primary: {
    what: "Change in haemoglobin",
    how: "Haemoglobin at week 6 minus haemoglobin at day 0",
    instrument: "automated laboratory analyser",
    time: ["D0", "W6"],
    unit: "g/dL",
    type: "continuous",
  },
  secondary: [
    {
      what: "Anaemia corrected",
      how: "Haemoglobin of 11.0 g/dL or above at week 6",
      instrument: "automated laboratory analyser",
      time: ["W6"],
      unit: "Yes / No",
      type: "binary",
    },
    {
      what: "Change in serum ferritin",
      how: "Serum ferritin at week 6 minus serum ferritin at day 0",
      instrument: "immunoassay",
      time: ["D0", "W6"],
      unit: "ng/mL",
      type: "continuous",
    },
    {
      what: "Adverse effects",
      how: "Each adverse effect recorded as present or absent since the last visit",
      instrument: "structured questioning at each visit",
      time: ["W2", "W4", "W6"],
      unit: "Yes / No",
      type: "binary",
    },
  ],
  exploratory_ideas: [
    "Whether the effect on haemoglobin differs by gestational age at enrolment",
    "Whether baseline serum ferritin is correlated with the change in haemoglobin",
    "Whether the effect differs by dietary pattern, which the protocol's hypothesis names",
  ],
  covariates: [
    { name: "baseline haemoglobin", inferred: false },
    { name: "gestational age at enrolment", inferred: true },
  ],
  proforma: [
    { item: "Name", keep: true, reason: "Capture infrastructure" },
    { item: "Hospital number", keep: true, reason: "Capture infrastructure" },
    { item: "Age", keep: true, reason: "Descriptor: who the results apply to" },
    { item: "Residence", keep: true, reason: "Descriptor" },
    { item: "Education", keep: false, reason: "Serves no objective" },
    { item: "Husband's occupation", keep: false, reason: "Serves no objective" },
    { item: "Blood group", keep: false, reason: "Serves no objective" },
    { item: "Gravidity", keep: true, reason: "Descriptor" },
    { item: "Parity", keep: true, reason: "Descriptor" },
    { item: "Gestational age", keep: true, reason: "Covariate of the adjusted primary model" },
    { item: "Height", keep: true, reason: "Raw input of body mass index" },
    { item: "Weight", keep: true, reason: "Raw input of body mass index" },
    { item: "Blood pressure", keep: false, reason: "Serves no objective" },
    { item: "Stool for ova and cysts", keep: false, reason: "Serves no objective" },
  ],
  sample_size: {
    per_group: 60,
    formula_family: "two-mean power formula",
    verdict: "partial",
    attrition: null,
  },
  open_items: [
    "SPSS version",
    "Expected proportion reaching haemoglobin of 11.0 g/dL or above, needed to confirm the risk-ratio model",
    "Gestational-age cut-off for the subgroup analysis; 24 weeks proposed",
    "Confirm gestational age as a covariate: it was inferred, not named in the protocol",
  ],
};
