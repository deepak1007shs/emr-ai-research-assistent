/**
 * The TypeScript view of study_spec.json.
 *
 * `study_spec.schema.json` is the contract; this mirrors it for the renderers.
 * A renderer that needs a field absent from here is a schema bug: add it to
 * both, never let a renderer invent a default.
 */

export type DataType =
  | "continuous" | "count" | "binary" | "ordinal"
  | "nominal" | "time_to_event" | "date" | "text";

export type Role =
  | "outcome_source" | "exposure" | "covariate" | "effect_modifier"
  | "mediator" | "collider" | "precision" | "stratifier" | "derived"
  | "administrative" | "eligibility" | "censoring" | "matching";

export type FieldType =
  | "number" | "date" | "single_select" | "multi_select" | "single_select_text" | "text";

export type Tier = "primary" | "secondary" | "exploratory";

export type CrfPlacement = {
  section_id: string;
  order: number;
  field_type: FieldType;
  response: string;
  options?: string[];
  mask?: string;
  export_note?: string;
};

export type Variable = {
  id: string;
  label: string;
  role: Role;
  data_type: DataType;
  subtype?: string;
  unit?: string;
  categories?: string[];
  reference_level?: string;
  definition_source?: "protocol" | "standard";
  definition_reference?: string;
  derived_from?: string[];
  derivation?: string;
  derivation_kind?: "formula" | "score" | "band" | "index";
  crf?: CrfPlacement;
};

export type Outcome = {
  id: string;
  label: string;
  tier: Tier;
  definition: string;
  instrument: string;
  timepoint_id: string;
  data_type: DataType;
  subtype?: string;
  unit?: string;
  summary_statistic?: string;
  domain?: string;
  source_variable_ids?: string[];
};

export type Estimand = {
  treatment_condition?: string;
  population?: string;
  endpoint?: string;
  intercurrent_event_strategy?: string;
  population_level_summary?: string;
};

export type Objective = {
  id: string;
  tier: Tier;
  question: string;
  outcome_ids?: string[];
  comparison_type?: string;
  margin?: string;
  estimand?: Estimand;
};

export type Analysis = {
  id: string;
  objective_id: string;
  outcome_id: string;
  unadjusted_test: string;
  adjusted_model?: string;
  covariate_ids?: string[];
  effect_measure?: string;
  table_ids?: string[];
  paired?: boolean;
  ph_check?: string;
  override_justification?: string;
};

export type ShellTable = {
  id: string;
  number: number;
  block: "descriptive" | "primary" | "secondary" | "exploratory" | "sensitivity";
  title: string;
  kind: string;
  row_variable_ids: string[];
  columns: string[];
  test_applied?: string;
  reference_rows?: string[];
  footnote?: string;
};

export type CrfSection = {
  id: string;
  title: string;
  order: number;
  parent_id?: string;
  timepoint_id?: string;
};

export type Timepoint = {
  id: string;
  label: string;
  order: number;
  window: string;
  offset_days?: number;
};

export type Criterion = {
  id: string;
  text: string;
  variable_id?: string;
  numeric?: { variable_id?: string; min?: number; max?: number };
};

export type StudySpec = {
  spec_version: string;
  locked_at?: string;
  study: {
    title: string;
    design: string;
    design_detail: Record<string, string>;
    framework: "PICO" | "PECO" | "PIRT";
    guideline: string;
    setting: string;
    centres?: number;
    recruitment_period?: { start?: string; end?: string };
    population: string;
    groups?: { id: string; label: string; allocation_ratio?: string }[];
    claim_strength?: string;
  };
  timepoints: Timepoint[];
  eligibility: { inclusion: Criterion[]; exclusion: Criterion[] };
  objectives: Objective[];
  outcomes: Outcome[];
  variables: Variable[];
  analyses: Analysis[];
  tables: ShellTable[];
  crf_sections: CrfSection[];
  sample_size: {
    formula: string;
    inputs: { name: string; value: number; source?: string }[];
    alpha: number;
    power: number;
    attrition?: number;
    n_per_group?: number;
    n_total: number;
    powered_outcome_id: string;
  };
  populations?: { id: string; label: string; definition: string; primary?: boolean; used_for?: string }[];
  multiplicity?: { family: string; method: string; note?: string }[];
  sensitivity_analyses?: { id: string; label: string; purpose: string; method: string }[];
  missing_data?: { expected_mechanism?: string; primary_method?: string; sensitivity_method?: string };
  open_items?: { id: string; question: string; owner: string }[];
  review?: Record<string, unknown>;
};

/** Lookup helpers every renderer needs. */
export function indexSpec(spec: StudySpec) {
  const by = <T extends { id: string }>(list: T[] = []) =>
    new Map(list.map((item) => [item.id, item]));
  return {
    variables: by(spec.variables),
    outcomes: by(spec.outcomes),
    objectives: by(spec.objectives),
    timepoints: by(spec.timepoints),
    sections: by(spec.crf_sections),
    tables: by(spec.tables),
  };
}

/** A variable is captured if it has a CRF field; derived values never do. */
export const isCaptured = (v: Variable) => Boolean(v.crf);
export const isDerived = (v: Variable) => v.role === "derived";
