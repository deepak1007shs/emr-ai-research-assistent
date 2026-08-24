import { describe, expect, it } from "vitest";
import { normalise } from "./ingest.ts";
import { STUDY_SPEC_JSON_SCHEMA } from "./ingest-schema.ts";

/**
 * The model's shape is flatter than the stored spec, because strict structured
 * outputs cannot express an optional key. These tests pin the conversion.
 */
describe("STUDY_SPEC_JSON_SCHEMA", () => {
  it("is strict all the way down, as structured outputs require", () => {
    const walk = (node: unknown, path: string): void => {
      if (!node || typeof node !== "object") return;
      const n = node as Record<string, unknown>;
      if (n.type === "object") {
        expect(n.additionalProperties, `${path}`).toBe(false);
        expect(Object.keys(n.properties as object).sort(), `${path} required`).toEqual(
          (n.required as string[]).slice().sort(),
        );
        for (const [key, child] of Object.entries(n.properties as object)) {
          walk(child, `${path}.${key}`);
        }
      }
      if (n.type === "array") walk(n.items, `${path}[]`);
    };
    walk(STUDY_SPEC_JSON_SCHEMA, "root");
  });
});

const base = {
  study: {
    title: "T", design: "rct_parallel",
    design_detail: [{ key: "allocation_ratio", value: "1:1" }],
    framework: "PICO", guideline: "CONSORT", setting: "hospital_based",
    centres: 1, population: "P", groups: [], claim_strength: "causal",
  },
  timepoints: [], eligibility: { inclusion: [], exclusion: [] },
  objectives: [], outcomes: [], analyses: [], tables: [], crf_sections: [],
  sample_size: { formula: "two_proportions", inputs: [], alpha: 0.05, power: 0.9, attrition: 0.1, n_per_group: 10, n_total: 20, powered_outcome_id: "out_1" },
  populations: [], multiplicity: [], sensitivity_analyses: [],
  missing_data: { expected_mechanism: "MAR", primary_method: "m", sensitivity_method: "s" },
  open_items: [],
  variables: [] as Record<string, unknown>[],
};

describe("normalise", () => {
  it("turns the design_detail pairs into an object", () => {
    const spec = normalise(structuredClone(base));
    expect(spec.study.design_detail).toEqual({ allocation_ratio: "1:1" });
  });

  it("strips the CRF block from a derived variable, whatever the model said", () => {
    const model = structuredClone(base);
    model.variables = [{
      id: "var_los", label: "Length of stay", role: "derived",
      data_type: "continuous", subtype: "ratio", unit: "days",
      categories: [], reference_level: "", definition_source: "none",
      definition_reference: "", derived_from: ["var_a", "var_b"],
      derivation: "b minus a", derivation_kind: "formula",
      // The model wrongly marked it collected; a derived value is never a field.
      crf: { collected: true, section_id: "sec_1", order: 1, field_type: "number", response: "___", options: [], mask: "" },
    }];
    const spec = normalise(model);
    expect(spec.variables[0].crf).toBeUndefined();
    expect(spec.variables[0].derived_from).toEqual(["var_a", "var_b"]);
  });

  it("keeps the CRF block on a captured variable", () => {
    const model = structuredClone(base);
    model.variables = [{
      id: "var_age", label: "Age", role: "covariate",
      data_type: "continuous", subtype: "ratio", unit: "years",
      categories: [], reference_level: "", definition_source: "protocol",
      definition_reference: "As recorded", derived_from: [], derivation: "",
      derivation_kind: "none",
      crf: { collected: true, section_id: "sec_1", order: 2, field_type: "number", response: "____ years", options: [], mask: "" },
    }];
    const spec = normalise(model);
    expect(spec.variables[0].crf?.section_id).toBe("sec_1");
    expect(spec.variables[0].derivation_kind).toBeUndefined();
  });

  it("drops the model's 'none' sentinels rather than storing them", () => {
    const model = structuredClone(base);
    model.variables = [{
      id: "var_x", label: "X", role: "covariate", data_type: "binary",
      subtype: "", unit: "", categories: [], reference_level: "",
      definition_source: "none", definition_reference: "", derived_from: [],
      derivation: "", derivation_kind: "none",
      crf: { collected: false, section_id: "", order: 0, field_type: "none", response: "", options: [], mask: "" },
    }];
    const spec = normalise(model);
    expect(spec.variables[0].definition_source).toBeUndefined();
    expect(spec.variables[0].unit).toBeUndefined();
    expect(spec.variables[0].subtype).toBe("unspecified");
  });

  it("keeps the estimand only on the primary objective", () => {
    const model = structuredClone(base);
    const estimand = {
      treatment_condition: "a", population: "b", endpoint: "c",
      intercurrent_event_strategy: "treatment_policy", population_level_summary: "d",
    };
    (model as Record<string, unknown>).objectives = [
      { id: "obj_1", tier: "primary", question: "q", outcome_ids: ["out_1"], comparison_type: "superiority", margin: "", estimand },
      { id: "obj_2", tier: "secondary", question: "q2", outcome_ids: ["out_2"], comparison_type: "none", margin: "", estimand },
    ];
    const spec = normalise(model);
    expect(spec.objectives[0].estimand).toBeDefined();
    expect(spec.objectives[1].estimand).toBeUndefined();
  });
});
