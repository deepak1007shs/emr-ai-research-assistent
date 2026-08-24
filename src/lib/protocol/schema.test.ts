import { describe, expect, it } from "vitest";
import {
  ACTION_SUBTITLE,
  MODEL_REVIEW_JSON_SCHEMA,
  actionSpecSchema,
  modelReviewSchema,
  reviewSpecSchema,
  toActionSpec,
  toReviewSpec,
} from "./schema";
import { fixtureSpec } from "@/lib/render/fixture";

/** A minimal, valid model response. */
function sampleModel() {
  return modelReviewSchema.parse({
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
    action_items: [
      { area: "Study design", issue: "Not stated.", change: "State it in the methods." },
      {
        area: "Sample size",
        issue: "No formula.",
        change: "Add a single-proportion calculation.",
      },
    ],
  });
}

describe("reviewSpecSchema", () => {
  it("accepts the fixture", () => {
    expect(reviewSpecSchema.safeParse(fixtureSpec).success).toBe(true);
  });

  it("rejects a spec carrying a variables section", () => {
    const withVariables = { ...fixtureSpec, variables: { rows: [["Age", "Continuous"]] } };
    expect(reviewSpecSchema.safeParse(withVariables).success).toBe(false);
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

  it("asks for the action items", () => {
    expect(jsonKeysOf()).toContain("action_items");
  });
});

function jsonKeysOf() {
  return Object.keys(MODEL_REVIEW_JSON_SCHEMA.properties);
}

describe("toReviewSpec", () => {
  it("turns the model's object rows into the builder's tuple rows", () => {
    const spec = toReviewSpec(sampleModel());
    expect(spec.peco.rows[0]).toEqual(["P — Population", "Adults"]);
    expect(spec.key_issues[0]).toEqual(["Design not stated", "Say it in words."]);
    expect(reviewSpecSchema.safeParse(spec).success).toBe(true);
  });

  it("leaves the compact-variant fields unset, so the two documents stay apart", () => {
    const spec = toReviewSpec(sampleModel());
    expect(spec.issues_table).toBeUndefined();
    expect(spec.snapshot).toBeUndefined();
  });
});

describe("toActionSpec", () => {
  it("numbers the rows in array order, since order is the priority", () => {
    const action = toActionSpec(sampleModel());

    expect(action.subtitle).toBe(ACTION_SUBTITLE);
    expect(action.issues_table.rows).toEqual([
      ["Study design", "Not stated.", "State it in the methods.", "1"],
      ["Sample size", "No formula.", "Add a single-proportion calculation.", "2"],
    ]);
    expect(actionSpecSchema.safeParse(action).success).toBe(true);
  });

  it("carries none of the narrative sections", () => {
    const action = toActionSpec(sampleModel());
    expect(action).not.toHaveProperty("title");
    expect(action).not.toHaveProperty("key_issues");
    expect(action).not.toHaveProperty("snapshot");
  });
});
