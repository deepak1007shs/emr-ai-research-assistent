/**
 * The strict JSON Schema the model fills in when drafting a study spec.
 *
 * Separate from `study_spec.schema.json` on purpose. That file is the contract
 * the gate enforces and carries optional fields; structured outputs require
 * every object to list every property in `required` with
 * `additionalProperties: false`. So this is a curated, fully-required view:
 * absent content is an empty string or an empty array, never a missing key.
 */

const str = { type: "string" } as const;
const num = { type: "number" } as const;
const int = { type: "integer" } as const;
const strArray = { type: "array", items: str } as const;

function obj<T extends Record<string, unknown>>(properties: T, description?: string) {
  return {
    type: "object",
    ...(description ? { description } : {}),
    properties,
    required: Object.keys(properties),
    additionalProperties: false,
  } as const;
}

const arrayOf = (items: unknown, description: string) =>
  ({ type: "array", description, items }) as const;

const DESIGNS = [
  "rct_parallel", "rct_crossover", "rct_cluster", "rct_factorial", "rct_stepped_wedge",
  "rct_non_inferiority", "rct_pilot", "n_of_1",
  "non_randomised_trial", "single_arm", "before_after", "interrupted_time_series",
  "cohort_prospective", "cohort_retrospective", "cohort_ambidirectional",
  "case_control", "case_control_nested", "case_cohort",
  "cross_sectional_analytical", "cross_sectional_descriptive",
  "case_report", "case_series", "ecological",
  "case_crossover", "self_controlled_case_series",
  "diagnostic_accuracy", "prognostic_model", "reliability_agreement",
  "economic_evaluation", "pk_bioequivalence", "instrument_validation",
  "qualitative", "mixed_methods", "systematic_review", "scoping_review",
];

const DATA_TYPES = [
  "continuous", "count", "binary", "ordinal", "nominal", "time_to_event", "date", "text",
];

const ROLES = [
  "outcome_source", "exposure", "covariate", "effect_modifier", "mediator", "collider",
  "precision", "stratifier", "derived", "administrative", "eligibility", "censoring", "matching",
];

/**
 * Stage 1 — the study and its questions.
 *
 * The whole specification in one strict schema is rejected by the API: "the
 * compiled grammar is too large". So ingest runs in three stages that follow the
 * traceability chain, each with a schema small enough to compile, and each able
 * to see what the stage before it produced.
 */
export const STAGE1_SCHEMA = obj({
  study: obj({
    title: { ...str, description: "The corrected full title, not the protocol's own wording if that was wrong." },
    design: { type: "string", enum: DESIGNS },
    design_detail: arrayOf(
      obj({ key: str, value: str }),
      "The facts this design requires. A case-control must give matching variables and ratio; a cluster trial its ICC and cluster size; a cohort its follow-up schedule and censoring rule; any randomised design its sequence generation, allocation concealment and blinding.",
    ),
    framework: { type: "string", enum: ["PICO", "PECO", "PIRT"] },
    guideline: { ...str, description: "CONSORT, STROBE, STARD, TRIPOD, PRISMA and so on." },
    setting: { type: "string", enum: ["hospital_based", "community_based", "multicentre", "registry", "laboratory"] },
    centres: int,
    population: str,
    groups: arrayOf(obj({ id: str, label: str, allocation_ratio: str }), "Use ids beginning grp_. Empty for a single-group study."),
    claim_strength: { type: "string", enum: ["descriptive", "association", "prediction", "accuracy", "causal"] },
  }),

  timepoints: arrayOf(
    obj({
      id: { ...str, description: "Begins tp_" },
      label: str,
      order: int,
      window: { ...str, description: "Day 28 is unusable; day 28 +/- 3 is a protocol." },
      offset_days: int,
    }),
    "Every occasion anything is measured, in order, each with its window.",
  ),

  eligibility: obj({
    inclusion: arrayOf(obj({ id: { ...str, description: "Begins elg_" }, text: str }), "Discrete, individually checkable criteria."),
    exclusion: arrayOf(obj({ id: { ...str, description: "Begins elg_" }, text: str }), "Must not leave a gap: if inclusion is ASA I-II, exclusion must be ASA III or above, so no patient is covered by neither."),
  }),
});

/** Stage B — the questions the study asks, and the size needed to answer them. */
export const STAGE1B_SCHEMA = obj({
  objectives: arrayOf(
    obj({
      id: { ...str, description: "Begins obj_" },
      tier: { type: "string", enum: ["primary", "secondary", "exploratory"] },
      question: { ...str, description: "Phrased as a question, which forces an outcome and a predictor to be named." },
      outcome_ids: strArray,
      comparison_type: { type: "string", enum: ["superiority", "non_inferiority", "equivalence", "none"] },
      margin: { ...str, description: "Required for non-inferiority and equivalence. Empty string otherwise." },
      estimand: obj({
        treatment_condition: str,
        population: str,
        endpoint: str,
        intercurrent_event_strategy: {
          type: "string",
          enum: ["treatment_policy", "hypothetical", "composite", "while_on_treatment", "principal_stratum"],
        },
        population_level_summary: str,
      }, "Required in full for the primary objective. For others, repeat the same values or leave the strings empty."),
    }),
    "Exactly one primary objective.",
  ),

  outcomes: arrayOf(
    obj({
      id: { ...str, description: "Begins out_" },
      label: str,
      tier: { type: "string", enum: ["primary", "secondary", "exploratory"] },
      definition: str,
      instrument: str,
      timepoint_id: str,
      data_type: { type: "string", enum: DATA_TYPES },
      subtype: { ...str, description: "The finer distinction that changes the analysis: ratio versus interval, bounded versus unbounded count, number of ordinal levels, censoring rule." },
      unit: { ...str, description: "Required for continuous and count outcomes. Empty otherwise." },
      summary_statistic: { ...str, description: "How it will appear in a table: proportion, mean (SD), median (IQR)." },
      domain: str,
      source_variable_ids: { ...strArray, description: "The variables that measure it. Never empty." },
    }),
    "Exactly one primary outcome.",
  ),
});

/** Stage B2 — how big the study must be, and the rules the analysis runs under. */
export const STAGE1C_SCHEMA = obj({
  sample_size: obj({
    formula: {
      type: "string",
      enum: ["single_proportion", "single_mean", "two_proportions", "two_means", "paired_means",
        "case_control_or", "correlation", "sensitivity_specificity", "time_to_event",
        "cluster_adjusted", "non_inferiority_means", "other"],
    },
    inputs: arrayOf(obj({ name: str, value: num, source: { ...str, description: "Where the number came from. Say 'not stated in the protocol' when it is absent." } }), "Every input the formula needs."),
    alpha: num,
    power: num,
    attrition: num,
    n_per_group: int,
    n_total: int,
    powered_outcome_id: { ...str, description: "Must be the primary outcome." },
  }),

  populations: arrayOf(obj({ id: { ...str, description: "Begins pop_" }, label: str, definition: str, primary: { type: "boolean" }, used_for: str }), "Required for interventional designs; exactly one primary."),
  multiplicity: arrayOf(obj({ family: str, method: str, note: str }), "One entry per outcome family."),
  sensitivity_analyses: arrayOf(obj({ id: { ...str, description: "Begins sen_" }, label: str, purpose: str, method: str }), "May be empty."),
  missing_data: obj({
    expected_mechanism: { type: "string", enum: ["MCAR", "MAR", "MNAR", "unknown"] },
    primary_method: str,
    sensitivity_method: str,
  }),
  open_items: arrayOf(obj({ id: { ...str, description: "Begins open_" }, question: str, owner: str }), "Decisions the investigator or guide must still make. May be empty."),
});

/** Stage C — the variables and where they sit on the form. */
export const STAGE2_SCHEMA = obj({
  variables: arrayOf(
    obj({
      id: { ...str, description: "Begins var_" },
      label: { ...str, description: "The single authoritative wording. No two objects may share a label." },
      role: { type: "string", enum: ROLES },
      data_type: { type: "string", enum: DATA_TYPES },
      subtype: str,
      unit: str,
      categories: { ...strArray, description: "Every level, for nominal and ordinal variables. Empty otherwise." },
      reference_level: { ...str, description: "Required when the variable is a categorical predictor." },
      definition_source: { type: "string", enum: ["protocol", "standard", "none"] },
      definition_reference: { ...str, description: "The protocol quote, or the named standard: ISGPS, Clavien-Dindo, CDC, KDIGO, NYHA, ASA." },
      derived_from: { ...strArray, description: "Only for role derived. The variables it is computed from." },
      derivation: { ...str, description: "Only for role derived. The formula in words." },
      derivation_kind: { type: "string", enum: ["formula", "score", "band", "index", "none"] },
      crf: obj({
        collected: { type: "boolean", description: "False for derived values, which are never fields on a form." },
        section_id: str,
        order: int,
        field_type: { type: "string", enum: ["number", "date", "single_select", "multi_select", "single_select_text", "text", "none"] },
        response: { ...str, description: "The answer space: blanks with units, a date mask, or the options." },
        options: strArray,
        mask: str,
      }),
    }),
    "The CRF collects raw and rich data. A derived value has collected false and no field. Never capture a band where the number is available, or a total where the items are.",
  ),

  crf_sections: arrayOf(
    obj({ id: { ...str, description: "Begins sec_" }, title: str, order: int, timepoint_id: str }),
    "One section per baseline block, and one per follow-up visit.",
  ),
});

/** Stage D — how each outcome is analysed and reported. */
export const STAGE3_SCHEMA = obj({
  analyses: arrayOf(
    obj({
      id: { ...str, description: "Begins ana_" },
      objective_id: str,
      outcome_id: str,
      unadjusted_test: str,
      adjusted_model: { ...str, description: "Empty when there is no adjusted model." },
      covariate_ids: { ...strArray, description: "Never include a mediator or a collider; adjusting for one destroys the effect being measured." },
      effect_measure: str,
      table_ids: strArray,
      paired: { type: "boolean" },
      ph_check: { ...str, description: "Required when the model is Cox regression." },
    }),
    "One analysis per outcome, at least.",
  ),

  tables: arrayOf(
    obj({
      id: { ...str, description: "Begins tbl_" },
      number: int,
      block: { type: "string", enum: ["descriptive", "primary", "secondary", "exploratory", "sensitivity"] },
      title: str,
      kind: { type: "string", enum: ["descriptive", "comparative", "effect", "accuracy", "agreement", "flow"] },
      row_variable_ids: strArray,
      columns: { ...strArray, description: "Never Model 1 / Model 2. Put unadjusted and adjusted side by side, each with a 95% CI." },
      test_applied: str,
      reference_rows: strArray,
      footnote: str,
    }),
    "Numbered contiguously from 1, blocks in order.",
  ),
});
