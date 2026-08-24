import { describe, expect, it } from "vitest";
import {
  MODEL_REVIEW_JSON_SCHEMA,
  modelReviewSchema,
  reviewSpecSchema,
  toReviewSpec,
} from "./schema";
import { fixtureSpec } from "@/lib/render/fixture";

describe("reviewSpecSchema", () => {
  it("accepts the fixture", () => {
    expect(reviewSpecSchema.safeParse(fixtureSpec).success).toBe(true);
  });

  it("rejects a spec carrying a variables section", () => {
    const withVariables = { ...fixtureSpec, variables: { rows: [["Age", "Continuous"]] } };
    const result = reviewSpecSchema.safeParse(withVariables);
    expect(result.success).toBe(false);
  });
});

describe("MODEL_REVIEW_JSON_SCHEMA", () => {
  it("is strict all the way down", () => {
    const walk = (node: unknown, path: string): void => {
      if (!node || typeof node !== "object") return;
      const n = node as Record<string, unknown>;
      if (n.type === "object") {
        expect(n.additionalProperties, `${path} additionalProperties`).toBe(false);
        expect(
          Object.keys(n.properties as object).sort(),
          `${path} required must list every property`,
        ).toEqual((n.required as string[]).slice().sort());
        for (const [key, child] of Object.entries(n.properties as object)) {
          walk(child, `${path}.${key}`);
        }
      }
      if (n.type === "array") walk(n.items, `${path}[]`);
    };
    walk(MODEL_REVIEW_JSON_SCHEMA, "root");
  });

  it("declares the same top-level keys as the zod model schema", () => {
    const zodKeys = Object.keys(modelReviewSchema.shape).sort();
    const jsonKeys = Object.keys(MODEL_REVIEW_JSON_SCHEMA.properties).sort();
    expect(jsonKeys).toEqual(zodKeys);
  });
});

describe("toReviewSpec", () => {
  it("turns the model's object rows into the builder's tuple rows", () => {
    const model = modelReviewSchema.parse({
      protocol_line: "Protocol reviewed: test",
      title: { as_written: "A title", suggestions: ["Fix it"] },
      type: { classification: "Cross-sectional study (STROBE), PECO.", suggestions: [] },
      peco: {
        framework: "PECO",
        intro: "",
        rows: [
          { element: "P — Population", content: "Adults" },
          { element: "E — Exposure", content: "Smoking" },
          { element: "C — Comparator", content: "Non-smokers" },
          { element: "O — Outcome", content: "Prevalence of COPD" },
        ],
      },
      objectives: {
        primary: { objective: "To estimate prevalence", outcome: "Proportion (%)" },
        secondary: [],
        exploratory: [],
      },
      sample_size: { what_they_did: "4pq/d²", verdict: "Correct", issues: [] },
      key_issues: [{ heading: "Design not stated", body: "Say it in words." }],
      footer: "",
    });

    const spec = toReviewSpec(model);
    expect(spec.peco.rows[0]).toEqual(["P — Population", "Adults"]);
    expect(spec.key_issues[0]).toEqual(["Design not stated", "Say it in words."]);
    expect(reviewSpecSchema.safeParse(spec).success).toBe(true);
  });
});
