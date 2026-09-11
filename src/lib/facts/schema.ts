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

const outcomeChain = {
  type: "object",
  additionalProperties: false,
  required: ["what", "how", "instrument", "time", "unit", "type"],
  properties: {
    what: { ...str, description: "Exactly what is measured. 'Change in haemoglobin', not 'efficacy'." },
    how: { ...str, description: "The method or definition: how the value is arrived at." },
    instrument: { ...str, description: "The tool, scale, assay or criteria used." },
    time: { ...strArray, description: "The visit codes it is measured at, from `timepoints`." },
    unit: { ...str, description: "The unit, or the two categories for a binary outcome." },
    type: { type: "string", enum: DATA_TYPES, description: "What kind of value it is." },
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
    "design", "design_label", "guideline", "frame", "groups", "allocation",
    "timepoints", "visit_schedule", "primary", "secondary", "exploratory_ideas", "covariates",
    "proforma", "sample_size", "open_items",
  ],
  properties: {
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
      type: "object", additionalProperties: false, required: ["ratio", "block", "strata"],
      properties: {
        ratio: { ...str, description: "'1:1', or '' where there is no allocation." },
        block: { type: ["integer", "null"], description: "Block size, or null." },
        strata: { ...strArray, description: "Stratification factors. These enter the adjusted model." },
      },
    },
    timepoints: { ...strArray, description: "Every visit code in order: D0, W2, W4, W6. One entry for a single assessment." },
    visit_schedule: {
      type: "array",
      description: "What is measured at each visit. An outcome read at more visits than its two endpoints gets a rate-of-change analysis as well, and this is the only place that is visible.",
      items: {
        type: "object", additionalProperties: false, required: ["timepoint", "measures"],
        properties: {
          timepoint: { ...str, description: "The visit code, from timepoints." },
          measures: { ...strArray, description: "What is measured at this visit, named as the outcomes and variables are." },
        },
      },
    },
    primary: { ...outcomeChain, description: "The one primary outcome. If the protocol names more than one, choose the one the title and aim promise and list the rest in open_items." },
    secondary: { type: "array", items: outcomeChain, description: "Each secondary outcome, with the same chain. Include one that appears only in the methods." },
    exploratory_ideas: { ...strArray, description: "Anything in the aims or the hypothesis that is not a formal objective. The hypothesis often names one." },
    covariates: {
      type: "array",
      description: "The factors an adjusted model would hold constant: those the protocol names, and clear confounders added with inferred set.",
      items: {
        type: "object", additionalProperties: false, required: ["name", "inferred"],
        properties: {
          name: { ...str, description: "The factor, named as a variable would be." },
          inferred: { type: "boolean", description: "True where the protocol does not name it and you added it." },
        },
      },
    },
    proforma: {
      type: "array",
      description: "Every item on the protocol's proforma or case sheet, each kept or dropped. Keep only what is an outcome, a named predictor, a covariate, a descriptor a reader needs, or capture infrastructure.",
      items: {
        type: "object", additionalProperties: false, required: ["item", "keep", "reason"],
        properties: {
          item: { ...str },
          keep: { type: "boolean" },
          reason: { ...str, description: "Why. 'Serves no objective' is the commonest reason to drop." },
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
        attrition: { type: ["string", "null"], description: "The allowance, or null where none is made." },
      },
    },
    open_items: { ...strArray, description: "Every question still waiting for the investigator. Each becomes a TODO in both documents. Anything the protocol leaves open belongs here rather than being guessed." },
  },
} as const;

/* ---- parsing what comes back ---------------------------------------- */

const chain = z.object({
  what: z.string(),
  how: z.string(),
  instrument: z.string(),
  time: z.array(z.string()),
  unit: z.string(),
  type: z.enum(DATA_TYPES),
});

export const factsSchema = z
  .object({
    design: z.enum(DESIGNS),
    design_label: z.string().min(1),
    guideline: z.string(),
    frame: z.enum(["PICO", "PECO"]),
    groups: z.array(z.object({ code: z.string(), label: z.string() })),
    allocation: z.object({
      ratio: z.string(),
      block: z.number().int().nullable(),
      strata: z.array(z.string()),
    }),
    timepoints: z.array(z.string()),
    visit_schedule: z.array(
      z.object({ timepoint: z.string(), measures: z.array(z.string()) }),
    ),
    primary: chain,
    secondary: z.array(chain),
    exploratory_ideas: z.array(z.string()),
    covariates: z.array(z.object({ name: z.string(), inferred: z.boolean() })),
    proforma: z.array(
      z.object({ item: z.string(), keep: z.boolean(), reason: z.string() }),
    ),
    sample_size: z.object({
      per_group: z.number().int().nullable(),
      formula_family: z.string(),
      verdict: z.enum(["correct", "wrong_formula", "absent", "partial"]),
      attrition: z.string().nullable(),
    }),
    open_items: z.array(z.string()),
  })
  .strict();
