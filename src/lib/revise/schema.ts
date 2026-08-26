/**
 * What a revision is allowed to change.
 *
 * Not a patch language and not a rebuild. The model returns the entities that
 * change, each tagged upsert or remove, and code splices them into the current
 * document. That keeps the output small, keeps the change reviewable as a diff,
 * and keeps every rule the documents already obey: the test is still chosen by
 * code, the wording is still copied from the plan's registry, and the
 * validators still run afterwards.
 *
 * Strict json_schema requires every key on every object, so "not applicable" is
 * an empty string or an empty array, which is the convention the builders
 * already use.
 */

const str = { type: "string" } as const;
const strArray = { type: "array", items: str } as const;
const bool = { type: "boolean" } as const;

function obj<T extends Record<string, unknown>>(properties: T, description?: string) {
  return {
    type: "object",
    ...(description ? { description } : {}),
    properties,
    required: Object.keys(properties),
    additionalProperties: false,
  } as const;
}

const OP = {
  type: "string",
  enum: ["upsert", "remove"],
  description: "upsert adds it or replaces it in full; remove deletes it. Nothing else changes.",
} as const;

const DATA_TYPE = {
  type: "string",
  enum: ["binary", "continuous", "ordinal", "nominal", "count", "time_to_event"],
} as const;

/** Shared by every revision: what changed, and what could not be done. */
const ENVELOPE = {
  summary: {
    ...str,
    description:
      "One or two plain sentences saying what you changed and why, addressed to the investigator. Not a list: the change itself is shown to them.",
  },
  needs_rebuild: {
    ...bool,
    description:
      "True only when the request cannot be met by editing, because it changes what the study is. Then return no edits and say so in summary.",
  },
} as const;

export const SAP_REVISION_SCHEMA = obj({
  ...ENVELOPE,
  aim: { ...str, description: "The replacement aim, or empty to leave it alone." },
  objective_edits: {
    type: "array",
    description: "Objectives to add, replace or remove, by id. Leave empty when none change.",
    items: obj({
      op: OP,
      id: { ...str, description: "P1, S1, S2..." },
      tier: { type: "string", enum: ["primary", "secondary"] },
      question: { ...str, description: "Phrased as a question. Empty for a remove." },
    }),
  },
  variable_edits: {
    type: "array",
    description: "Variables to add, replace or remove, by id. Removing one that an analysis uses will be reported as an error, so remove the analysis too.",
    items: obj({
      op: OP,
      id: { ...str, description: "var_age, var_bmi. Reuse the existing id when changing one." },
      label: { ...str, description: "The single authoritative wording. Empty for a remove." },
      data_type: DATA_TYPE,
      unit_coding: str,
      role: {
        type: "string",
        enum: ["outcome", "predictor", "confounder", "effect_modifier", "mediator", "collider", "descriptor"],
      },
      exclusion_reason: {
        ...str,
        description: "Required for a mediator or collider: why adjusting for it would be wrong.",
      },
    }),
  },
  outcome_edits: {
    type: "array",
    description: "Outcomes to add, replace or remove, by id. An outcome must answer all five questions.",
    items: obj({
      op: OP,
      id: { ...str, description: "out_conversion. Reuse the existing id when changing one." },
      what: str,
      how: str,
      instrument: str,
      when: str,
      units: str,
      domain: {
        type: "string",
        enum: ["clinical", "laboratory", "radiological", "functional", "patient_reported", "economic", "composite"],
      },
      source_variable_ids: strArray,
    }),
  },
  analysis_edits: {
    type: "array",
    description:
      "Analysis rows to add, replace or remove, keyed by objective_id. Do NOT name a statistical test: it is chosen from the data type and the comparison by the application.",
    items: obj({
      op: OP,
      objective_id: str,
      label: { ...str, description: "'P1 - conversion rate'." },
      outcome_id: str,
      predictor_ids: strArray,
      data_type: DATA_TYPE,
      comparison: {
        type: "string",
        enum: ["single_group", "two_groups", "many_groups", "association", "adjusted", "paired", "correlation", "agreement", "descriptive"],
      },
      paired: bool,
      skewed: bool,
      table_id: { ...str, description: "T1, T2, T3..." },
    }),
  },
});

export const CRF_REVISION_SCHEMA = obj({
  ...ENVELOPE,
  field_edits: {
    type: "array",
    description:
      "Fields to add, replace or remove. A field is found by its section letter and its variable_id, or by its label when it has no variable_id.",
    items: obj({
      op: OP,
      section_letter: { ...str, description: "The section it belongs to. Empty for an identifier." },
      variable_id: { ...str, description: "The variable from the plan, or empty when it is not analysed." },
      label: { ...str, description: "Used only when variable_id is empty." },
      type: {
        type: "string",
        enum: ["Number", "Date", "Single-select", "Multi-select", "Single-select + text", "Text", "Text / Date"],
      },
      options: { ...strArray, description: "Every allowed answer, for a select." },
      unit: { ...str, description: "Required for a Number." },
      note: str,
      primary_outcome: bool,
    }),
  },
  section_edits: {
    type: "array",
    description: "Whole sections to add, replace or remove, by letter. Replacing one replaces its fields.",
    items: obj({
      op: OP,
      letter: str,
      title: str,
      visit: str,
      note: str,
    }),
  },
  derived_edits: {
    type: "array",
    description: "Calculated values to add, replace or remove. Their ingredients must be fields on the form.",
    items: obj({
      op: OP,
      variable_id: { ...str, description: "The variable from the plan, when it declares one." },
      name: { ...str, description: "Used only when variable_id is empty." },
      from_variable_ids: strArray,
      how: str,
    }),
  },
});

export const TABLES_REVISION_SCHEMA = obj({
  ...ENVELOPE,
  table_edits: {
    type: "array",
    description:
      "Whole tables to add, replace or remove, by number. A table is small enough to give in full, so give it in full.",
    items: obj({
      op: OP,
      number: { type: "integer" },
      block: { type: "string", enum: ["descriptive", "primary", "secondary", "exploratory"] },
      outcome_id: { ...str, description: "The outcome this reports. Empty for a descriptive table." },
      adjusted_for: { ...strArray, description: "For an effect table: the variable ids adjusted for." },
      title: { ...str, description: "Including the denominator, e.g. '... (n = 125)'." },
      kind: {
        type: "string",
        enum: ["descriptive", "comparative", "effect", "accuracy", "distribution", "repeated"],
      },
      columns: strArray,
      rows: {
        type: "array",
        items: obj({
          variable_id: { ...str, description: "The variable this row reports, from the plan." },
          label: { ...str, description: "Used when variable_id is empty: a sub-row or a category." },
          heading: bool,
          indent: bool,
        }),
      },
      test_applied: str,
      footnote: str,
    }),
  },
});
