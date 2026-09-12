import { z } from "zod";

/**
 * What the model is asked for, and the only thing it is asked for.
 *
 * This is the last judgement in the pipeline. Everything after it - the
 * objectives, the variable list, the analysis map, the tables, the form - is
 * derived from these fields by rule. That is the whole reason the same protocol
 * used to give sixteen tables one run and twenty the next: the model was asked
 * again at every step, and answered differently each time.
 *
 * So the fields here are facts a reader could point at in the protocol, never
 * decisions. "What does the primary outcome measure, in what unit, at which
 * visits" is a fact. "Which test should it get" is not, and is not asked.
 */

const str = { type: "string" } as const;
const strArray = { type: "array", items: { type: "string" } } as const;

/** The closed lists, repeated here because the JSON schema cannot import them. */
const DESIGNS = [
  "randomised_trial", "non_inferiority_trial", "crossover_trial", "cluster_trial",
  "factorial_trial", "non_randomised_interventional", "cohort", "case_control",
  "cross_sectional", "descriptive_epidemiology", "diagnostic_accuracy",
  "prognostic_model", "agreement", "qualitative", "mixed_methods",
  "systematic_review", "economic_evaluation", "case_report",
] as const;

const DATA_TYPES = [
  "continuous", "count", "binary", "nominal", "ordinal", "date", "text",
  "time_to_event",
] as const;

const CHAIN_KINDS = ["comparison", "association", "accuracy", "estimation"] as const;

const outcomeChain = {
  type: "object",
  additionalProperties: false,
  required: ["what", "how", "instrument", "time", "unit", "type", "measures", "distribution", "expected_frequency", "competing_event", "kind", "exposures"],
  properties: {
    kind: {
      type: "string",
      enum: CHAIN_KINDS,
      description: "What this outcome is asked about. 'comparison' where named groups are compared, the way a trial compares its arms. 'association' where the factors are variables inside one cohort - duration of ischaemia, mechanism of injury, whether a procedure was done - and the study has no arms. 'accuracy' where measured values are asked how well they identify the outcome: a score, a biomarker, or an index test against a reference standard. 'estimation' only where the study genuinely reports one number and compares nothing, as a prevalence survey does. Most outcomes of an observational study are an association, not an estimation.",
    },
    exposures: {
      type: "array",
      description: "For an association or an accuracy outcome, the factors this objective is actually about, in the order the protocol names them. Empty for a comparison or an estimation. These are what the analysis estimates; the confounders it holds constant belong in `covariates` and are not repeated here. A protocol asking 'is amputation associated with ischaemia time, mechanism and level of injury, adjusted for age and shock' has three exposures here and age and shock as covariates.",
      items: {
        type: "object", additionalProperties: false, required: ["measure", "at", "reference"],
        properties: {
          measure: { ...str, description: "The name, from `measures`, of the factor." },
          at: { type: "string", description: "The visit code the value is taken at, where it is recorded at several. Empty otherwise." },
          reference: { type: "string", description: "For a categorical factor, the category the others are compared with: 'Blunt', 'No shock'. Empty for a measured value." },
        },
      },
    },
    what: { ...str, description: "Exactly what is measured. 'Change in haemoglobin', not 'efficacy'." },
    how: { ...str, description: "The method or definition: how the value is arrived at." },
    instrument: { ...str, description: "The tool, scale, assay or criteria used." },
    time: { ...strArray, description: "Every visit code this is measured at, from `timepoints`. For a change from day 0 to week 6 where the value is also read at weeks 2 and 4, that is all four visits and not the two endpoints." },
    unit: { ...str, description: "The unit, or the two categories for a binary outcome." },
    type: { type: "string", enum: DATA_TYPES, description: "What kind of value it is." },
    distribution: { type: "string", enum: ["normal", "skewed", "unknown"], description: "What the values are expected to look like, from what is known of the measure before the study starts. Serum ferritin, CRP and length of stay are skewed; haemoglobin and blood pressure are not. Use unknown rather than guessing." },
    expected_frequency: { type: ["number", "null"], description: "For a binary or time-to-event outcome, the proportion expected to have the event, as a number between 0 and 1. It is what limits the model: a binary or survival analysis is limited by its events and not by its participants. Null where the protocol does not say, which becomes a question for the investigator." },
    competing_event: { type: "string", description: "For a time-to-event outcome only: the event that can happen first and prevent it, such as death before relapse. Empty for any other outcome type, where nothing can intervene, or where the event is death itself." },
    measures: { ...strArray, description: "The names, from `measures`, this outcome is built from. One for a raw outcome; for a change or a threshold, the one measure it is computed from." },
  },
} as const;

/**
 * The schema the model fills.
 *
 * Every outcome walks the whole chain, because Gate A refuses a primary outcome
 * with a link missing and the study stops there. A protocol that genuinely does
 * not say goes to `open_items` and the investigator answers it; the model never
 * fills a link with a guess.
 */
export const FACTS_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "title", "aim", "hypothesis", "question_type", "unit_of_analysis", "exposure_fixed_at_baseline", "population", "intervention", "comparator", "design", "design_label", "guideline", "frame", "groups", "allocation",
    "timepoints", "measures", "visit_schedule", "primary", "secondary", "exploratory_ideas", "covariates",
    "proforma", "sample_size", "stated_rules", "open_items",
  ],
  properties: {
    title: { ...str, description: "The protocol's title, word for word, including the design phrase after the colon where it has one." },
    aim: { ...str, description: "The aim, in the protocol's own words." },
    question_type: { type: "string", enum: ["effect", "association", "prediction"], description: "Read the wording of the objective. 'The effect of X on Y' or 'the association of X with Y' is effect or association. 'To develop a score to predict Y' is prediction, and is judged by discrimination and calibration rather than by the p value of each variable." },
    unit_of_analysis: {
      type: "object", additionalProperties: false,
      required: ["unit", "repeats_within_participant"],
      description: "What one row of the data is. Read the outcome definition: an outcome measured per eye, per lesion, per tooth or per reading gives more than one row per participant.",
      properties: {
        unit: { ...str, description: "'participant', 'eye', 'lesion', 'tooth', 'reading'." },
        repeats_within_participant: { type: "boolean", description: "True where one participant contributes more than one row, apart from repeat visits, which the visit schedule already records." },
      },
    },
    exposure_fixed_at_baseline: { type: "boolean", description: "True where everyone's group or exposure is settled at the moment follow-up starts. False where it is defined by something that happens during follow-up, such as 'patients who received drug X during admission', because those patients had to survive long enough to receive it." },
    hypothesis: { type: "string", description: "The hypothesis in the protocol's own words, or empty where there is none. Never write one that is not there." },
    population: {
      type: "object", additionalProperties: false,
      required: ["eligibility", "setting", "sampling", "short"],
      properties: {
        eligibility: { ...str, description: "Who is included and who is excluded, in the protocol's own words." },
        setting: { ...str, description: "Where: the department and the institution." },
        short: { ...str, description: "The population in one short noun phrase, for the assembled question: 'pregnant women with iron-deficiency anaemia'." },
        sampling: { ...str, description: "How participants are selected. Consecutive is the strongest non-probability method; call convenience sampling what it is." },
      },
    },
    intervention: { ...str, description: "What is given, with dose, route and schedule; or the exposure that is observed." },
    comparator: { ...str, description: "The control arm or the reference level. For a within-person comparison, the person's own other measurement." },
    design: { type: "string", enum: DESIGNS, description: "The design family, checked against the protocol rather than taken from what it calls itself. A timing word such as 'prospective' is not a design." },
    design_label: { ...str, description: "The exact label: 'two-arm parallel-group open-label superiority randomised controlled trial'." },
    guideline: { ...str, description: "The reporting guideline the design owes: CONSORT, STROBE, STARD, TRIPOD." },
    frame: { type: "string", enum: ["PICO", "PECO"], description: "PICO where the investigator assigns the intervention, PECO where an exposure is observed." },
    groups: {
      type: "array",
      description: "The arms or exposure groups, in the order the protocol names them. Empty for a single-group study.",
      items: {
        type: "object", additionalProperties: false, required: ["code", "label"],
        properties: {
          code: { ...str, description: "A short code: FCM, ORAL." },
          label: { ...str, description: "The full name as the protocol writes it." },
        },
      },
    },
    allocation: {
      type: "object", additionalProperties: false, required: ["ratio", "block", "strata", "matched"],
      properties: {
        ratio: { ...str, description: "'1:1', or '' where there is no allocation." },
        block: { type: ["integer", "null"], description: "Block size, or null." },
        strata: { ...strArray, description: "Stratification factors. These enter the adjusted model." },
        matched: { type: "string", description: "How participants were matched, where they were: '1 case to 2 controls, matched on age and sex'. Empty where they were not. Matching changes the analysis, so it is recorded even where the protocol mentions it only in passing." },
      },
    },
    timepoints: { ...strArray, description: "Every visit code in order: D0, W2, W4, W6. One entry for a single assessment." },
    measures: {
      type: "array",
      description: "Every distinct thing the study records, once each: outcomes, covariates, descriptors and administrative items. Name each in lower case with underscores, and use that name everywhere else.",
      items: {
        type: "object", additionalProperties: false,
        required: ["name", "label", "type", "unit", "options", "block", "derived_from", "recipe"],
        properties: {
          name: { ...str, description: "Lower case, words joined by underscores: 'serum_ferritin'." },
          label: { ...str, description: "How it is written on a form: 'Serum ferritin'." },
          type: { type: "string", enum: DATA_TYPES },
          unit: { type: "string", description: "For a numeric measure. Empty for a categorical one." },
          options: { type: ["array", "null"], items: { type: "string" }, description: "For a categorical measure, every category in print order, Yes before No and Male before Female. Null for a numeric one. A list, never a sentence: a range written as prose cannot be drawn as rows." },
          block: { type: "string", description: "For a baseline characteristic, the words that finish its table's title: 'demographic and obstetric characteristics', 'haematological and iron profile', 'comorbidities'. Measures sharing these words share a table, and two blocks are never merged. Empty for an outcome, an administrative field, or a variable that only defines an analysis set." },
          derived_from: { ...strArray, description: "The measures this one is computed from, by name. Empty for anything written on the form. Body mass index is computed from height and weight and belongs here." },
          recipe: { type: "string", description: "The calculation in plain words, where there is one. Empty otherwise." },
        },
      },
    },
    visit_schedule: {
      type: "array",
      description: "What is measured at each visit. An outcome read at more visits than its two endpoints gets a rate-of-change analysis as well, and this is the only place that is visible.",
      items: {
        type: "object", additionalProperties: false, required: ["timepoint", "label", "measures"],
        properties: {
          timepoint: { ...str, description: "The visit code, from timepoints." },
          label: { ...str, description: "How the visit is written in a table: 'Day 0', 'Week 6'." },
          measures: { ...strArray, description: "The names, from `measures`, recorded at this visit. Enrolment records the descriptors and the administrative items as well as the outcomes." },
        },
      },
    },
    primary: { ...outcomeChain, description: "The one primary outcome. If the protocol names more than one, choose the one the title and aim promise and list the rest in open_items." },
    secondary: { type: "array", items: outcomeChain, description: "Each secondary outcome, with the same chain. Include one that appears only in the methods." },
    exploratory_ideas: {
      type: "array",
      description: "Anything in the aims or the hypothesis that is not a formal objective. The hypothesis often names one, and it is often the only place a variable is mentioned.",
      items: {
        type: "object", additionalProperties: false,
        required: ["question", "kind", "outcome_of", "with"],
        properties: {
          question: { ...str, description: "The idea as a question, in the protocol's own words as far as they allow: 'Does the effect on haemoglobin differ by dietary pattern?'" },
          kind: { type: "string", enum: ["subgroup", "interaction", "derivation", "correlation"], description: "Whether it splits the sample, tests an effect changing with something, defines a new value, or relates two values." },
          outcome_of: { ...str, description: "The name of the outcome the question is asked of. For a change, the name of the change." },
          with: { ...strArray, description: "The other measures the question involves, by name. Include one the protocol never collects: that is what promotion is for." },
        },
      },
    },
    covariates: {
      type: "array",
      description: "The factors an adjusted model would hold constant: those the protocol names, and clear confounders added with inferred set.",
      items: {
        type: "object", additionalProperties: false, required: ["measure", "at", "inferred"],
        properties: {
          measure: { ...str, description: "The name, from `measures`, of the factor held constant." },
          at: { type: "string", description: "The visit code the value is taken at, where the measure is taken at several. Empty otherwise." },
          inferred: { type: "boolean", description: "True where the protocol does not name it and you added it." },
        },
      },
    },
    proforma: {
      type: "array",
      description: "Every item on the protocol's proforma or case sheet, each kept or dropped. Keep only what is an outcome, a named predictor, a covariate, a descriptor a reader needs, or capture infrastructure.",
      items: {
        type: "object", additionalProperties: false, required: ["item", "measure", "keep", "reason", "purpose"],
        properties: {
          item: { ...str },
          measure: { type: "string", description: "The name, from `measures`, this item records. Empty for a dropped item." },
          keep: { type: "boolean" },
          reason: { ...str, description: "Why. 'Serves no objective' is the commonest reason to drop." },
          purpose: {
            anyOf: [
              { type: "string", enum: ["administrative", "descriptor", "population", "input"] },
              { type: "null" },
            ],
            description: "What a kept item is for: capture infrastructure, a baseline characteristic a reader needs, a variable deciding who is in an analysis set, or a raw input of something derived. Null for a dropped item.",
          },
        },
      },
    },
    sample_size: {
      type: "object", additionalProperties: false,
      required: ["per_group", "formula_family", "verdict", "attrition"],
      properties: {
        per_group: { type: ["integer", "null"] },
        formula_family: { ...str, description: "'two-mean power formula', 'two-proportion power formula', or '' where absent." },
        verdict: { type: "string", enum: ["correct", "wrong_formula", "absent", "partial"] },
        attrition: { type: "string", description: "The allowance, or empty where none is made." },
      },
    },
    stated_rules: {
      type: "object", additionalProperties: false,
      required: ["software", "alpha", "sided", "ci_level", "missing_data", "interim"],
      description: "The analysis rules the protocol actually states. Null for each one it does not: the plan supplies a house default and marks it, and a default the investigator can see is not the same as a guess.",
      properties: {
        software: { type: "string", description: "The package and its version, where both are given." },
        alpha: { type: "string", description: "'0.05', or empty." },
        // A nullable choice is written as anyOf. `type: [string, null]` with an
        // enum is valid JSON Schema and the API rejects it: "Enum value 'one'
        // does not match declared type". It was found by the first real run.
        sided: { anyOf: [{ type: "string", enum: ["one", "two"] }, { type: "null" }] },
        ci_level: { type: "string", description: "'95%', or empty." },
        missing_data: { type: "string", description: "The protocol's own words about missing data, or empty." },
        interim: { type: "string", description: "The protocol's interim-analysis rule, or empty." },
      },
    },
    open_items: { ...strArray, description: "Every question still waiting for the investigator. Each becomes a TODO in both documents. Anything the protocol leaves open belongs here rather than being guessed." },
  },
} as const;

/* ---- parsing what comes back ---------------------------------------- */

/**
 * A text field the protocol may not fill.
 *
 * The model's schema asks for text, with an empty string meaning "the protocol
 * does not say", and this turns it back into the null every later step
 * expects. It is done this way because the structured-output compiler refuses a
 * schema with more than 16 nullable or union-typed fields - "exponential
 * compilation cost" - and the Facts Sheet had 22. Fifteen of them were text
 * where null and empty mean the same thing; they are text now, and seven
 * unions remain. A blank of spaces is absent too: no field here means anything
 * by whitespace.
 */
const absent = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? null : value),
  z.string().nullable(),
);

const chain = z.object({
  what: z.string(),
  how: z.string(),
  instrument: z.string(),
  time: z.array(z.string()),
  unit: z.string(),
  type: z.enum(DATA_TYPES),
  measures: z.array(z.string()),
  distribution: z.enum(["normal", "skewed", "unknown"]),
  expected_frequency: z.number().nullable(),
  competing_event: absent,
  // Defaulted rather than required, so that a reading stored before these
  // fields existed still parses and still builds its plan. A protocol read
  // after them says which it is; one read before is a comparison, which is
  // what every study the application had built until then actually was.
  kind: z.enum(CHAIN_KINDS).default("comparison"),
  exposures: z
    .array(z.object({ measure: z.string(), at: absent, reference: absent }))
    .default([]),
});

export const factsSchema = z
  .object({
    title: z.string(),
    aim: z.string(),
    hypothesis: absent,
    question_type: z.enum(["effect", "association", "prediction"]),
    unit_of_analysis: z.object({
      unit: z.string(),
      repeats_within_participant: z.boolean(),
    }),
    exposure_fixed_at_baseline: z.boolean(),
    population: z.object({
      eligibility: z.string(),
      setting: z.string(),
      sampling: z.string(),
      short: z.string(),
    }),
    intervention: z.string(),
    comparator: z.string(),
    design: z.enum(DESIGNS),
    design_label: z.string().min(1),
    guideline: z.string(),
    frame: z.enum(["PICO", "PECO"]),
    groups: z.array(z.object({ code: z.string(), label: z.string() })),
    allocation: z.object({
      ratio: z.string(),
      block: z.number().int().nullable(),
      strata: z.array(z.string()),
      matched: absent,
    }),
    timepoints: z.array(z.string()),
    measures: z.array(
      z.object({
        name: z.string().min(1),
        label: z.string().min(1),
        type: z.enum(DATA_TYPES),
        unit: absent,
        options: z.array(z.string()).nullable(),
        block: absent,
        derived_from: z.array(z.string()),
        recipe: absent,
      }),
    ),
    visit_schedule: z.array(
      z.object({
        timepoint: z.string(),
        label: z.string(),
        measures: z.array(z.string()),
      }),
    ),
    primary: chain,
    secondary: z.array(chain),
    exploratory_ideas: z.array(
      z.object({
        question: z.string(),
        kind: z.enum(["subgroup", "interaction", "derivation", "correlation"]),
        outcome_of: z.string(),
        with: z.array(z.string()),
      }),
    ),
    covariates: z.array(
      z.object({
        measure: z.string(),
        at: absent,
        inferred: z.boolean(),
      }),
    ),
    proforma: z.array(
      z.object({
        item: z.string(),
        measure: absent,
        keep: z.boolean(),
        reason: z.string(),
        purpose: z
          .enum(["administrative", "descriptor", "population", "input"])
          .nullable(),
      }),
    ),
    sample_size: z.object({
      per_group: z.number().int().nullable(),
      formula_family: z.string(),
      verdict: z.enum(["correct", "wrong_formula", "absent", "partial"]),
      attrition: absent,
    }),
    stated_rules: z.object({
      software: absent,
      alpha: absent,
      sided: z.enum(["one", "two"]).nullable(),
      ci_level: absent,
      missing_data: absent,
      interim: absent,
    }),
    open_items: z.array(z.string()),
  })
  .strict();
