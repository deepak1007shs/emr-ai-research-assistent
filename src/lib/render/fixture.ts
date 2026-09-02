import {
  SUBTITLE,
  toActionSpec,
  type ActionSpec,
  type ReviewSpec,
} from "@/lib/protocol/schema";

/**
 * A hand-written spec used by the renderer tests. The awkward content is
 * deliberate: the comparator cell contains a literal pipe and a newline, which
 * is exactly what breaks a naively-built markdown table.
 */
export const fixtureSpec: ReviewSpec = {
  subtitle: SUBTITLE,
  protocol_line: "Protocol reviewed: MD thesis protocol — Department of Medicine",
  title: {
    as_written:
      "A prospective study to evaluate the efficacy of procalcitonin in sepsis patients",
    suggestions: [
      "\"Prospective\" is timing, not a design — the design word is missing from the title.",
      "\"Efficacy\" over-claims: no intervention is allocated and there is no control arm.",
      "Suggested full title: \"Diagnostic accuracy of serum procalcitonin for culture-confirmed sepsis in adults admitted to a tertiary-care medical ICU: a hospital-based prospective cross-sectional study\"",
    ],
  },
  type: {
    classification:
      "Hospital-based prospective diagnostic accuracy study (STARD). Although the protocol calls it cross-sectional, the aim is test performance against a reference standard, so aim beats structure. The question frame is PECO.",
    suggestions: [
      "State the design in words in the methods section, not only in the title.",
      "Name STARD as the reporting guideline and add a STARD flow diagram.",
    ],
  },
  peco: {
    framework: "PECO",
    intro: "Framed as PECO because no intervention is allocated by the investigator.",
    rows: [
      ["P — Population", "Adults ≥18 years admitted to the medical ICU with suspected sepsis"],
      ["E — Exposure", "Serum procalcitonin measured within 6 hours of admission"],
      [
        "C — Comparator",
        "Reference standard: blood culture positivity | adjudicated by two intensivists\nblinded to the index test",
      ],
      ["O — Outcome", "Sensitivity and specificity with 95% confidence intervals"],
    ],
  },
  objectives: {
    primary: {
      objective:
        "To determine the sensitivity and specificity of serum procalcitonin for culture-confirmed sepsis",
      outcome:
        "Sensitivity and specificity (%) of procalcitonin at a pre-stated cut-off of 0.5 ng/mL, against blood culture as reference standard, measured within 6 hours of ICU admission; diagnostic performance domain; binary classification.",
    },
    secondary: [
      {
        objective: "To determine the optimal procalcitonin cut-off",
        outcome:
          "Area under the ROC curve with 95% CI, and the Youden-index cut-off; diagnostic performance domain; continuous.",
      },
    ],
    exploratory: [
      {
        text: "To explore the association between procalcitonin and 28-day mortality",
        outcome:
          "All-cause mortality at day 28 from admission, from hospital records; mortality domain; binary. Exploratory — not powered.",
      },
    ],
  },
  sample_size: {
    what_they_did:
      "The protocol states n = 100 using the formula 4pq/d² with p = 50% and d = 10%, citing a previous prevalence study.",
    verdict: "Wrong formula",
    issues: [
      "A prevalence formula cannot power a diagnostic accuracy study — precision is needed separately in the diseased and non-diseased strata.",
      "Recompute using n_diseased = Z²·Sn(1−Sn)/d² and n_nondiseased = Z²·Sp(1−Sp)/d², then divide by prevalence and (1 − prevalence) respectively, and take the larger total.",
      "State the expected sensitivity and specificity with the source they came from.",
      "Add non-evaluable samples and refusals: n_final = n / (1 − dropout).",
    ],
  },
  key_issues: [
    [
      "The title, the aim, and the sample size are three different studies",
      "The title promises efficacy, the aim measures diagnostic accuracy, and the sample size is computed for a prevalence survey. Decide that this is a diagnostic accuracy study, then rewrite the title and redo the calculation with a sensitivity/specificity formula so all three name the same thing.",
    ],
    [
      "Comorbidities are named as a category but never itemised",
      "The proforma has a single line reading \"comorbidities\". Pre-list each one — diabetes, chronic kidney disease, cirrhosis, malignancy, HIV — as its own yes/no field before data collection starts. If this is left as free text, every data collector will record something different and the dataset cannot be cleaned afterwards.",
    ],
  ],
  footer: "Prepared for postgraduate protocol review. Every criticism above carries its fix.",
};

/** The short companion document for the same protocol. */
export const fixtureActionSpec: ActionSpec = toActionSpec({
  protocol_line: "Protocol reviewed: MD thesis protocol — Department of Medicine",
  title: { as_written: "x", suggestions: [] },
  type: { classification: "x", suggestions: [] },
  peco: { framework: "PECO", intro: "", rows: [] },
  objectives: {
    primary: { objective: "x", outcome: "x" },
    secondary: [],
    exploratory: [],
  },
  sample_size: { what_they_did: "x", verdict: "x", issues: [] },
  key_issues: [["x", "x"]].map(([heading, body]) => ({ heading, body })),
  footer: "",
  action_items: [
    {
      area: "Sample size",
      issue:
        "The study is powered with a prevalence formula although its aim is diagnostic accuracy.",
      change:
        "Recalculate using separate sensitivity and specificity formulas | divide each by prevalence and (1 − prevalence), and take the larger total.",
      affects: "none" as const,
      kind: "none" as const,
      target: "",
    },
    {
      area: "Study design",
      issue: "The protocol calls itself cross-sectional while the aim is test accuracy.",
      change: "Relabel it a diagnostic accuracy study and report it to STARD.",
      affects: "none" as const,
      kind: "none" as const,
      target: "",
    },
    {
      area: "Data collection",
      issue: "The proforma records \"comorbidities\" as a single free-text line.",
      change:
        "Pre-list each comorbidity as its own yes/no field before data collection starts.",
      affects: "crf" as const,
      kind: "variable_missing" as const,
      target: "each comorbidity as its own yes/no field",
    },
  ],
});
