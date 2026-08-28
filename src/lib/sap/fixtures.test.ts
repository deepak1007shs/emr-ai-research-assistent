import { describe, expect, it } from "vitest";
import { sapFixture } from "./fixture.ts";
import { crfFixture } from "../crf/fixture.ts";
import { tablesFixture } from "../tables/fixture.ts";
import { validateSap } from "./validate.ts";
import { validateCrf } from "../crf/validate.ts";
import { validateTables } from "../tables/validate.ts";

/**
 * The three fixtures are one study.
 *
 * They describe the same operation on the same patients, so they must agree
 * about it. They did not: the form collected height and weight and derived body
 * mass index, which is right, while the plan declared neither, and the form
 * never collected the exposure one of the plan's analyses compares by. Nothing
 * noticed, because each document was checked against a smaller plan written
 * beside its own test.
 *
 * This is the check that would have noticed.
 */

const errors = (findings: { severity: string; code: string; message: string }[]) =>
  findings.filter((f) => f.severity === "ERROR");

describe("the fixtures are one study", () => {
  it("the plan is sound on its own", () => {
    const found = errors(validateSap(sapFixture).findings);
    expect(found, JSON.stringify(found, null, 2)).toEqual([]);
  });

  it("the form collects what the plan analyses", () => {
    const found = errors(validateCrf(crfFixture, sapFixture).findings);
    expect(found, JSON.stringify(found, null, 2)).toEqual([]);
  });

  it("the tables report what the plan analyses", () => {
    const found = errors(validateTables(tablesFixture, sapFixture).findings);
    expect(found, JSON.stringify(found, null, 2)).toEqual([]);
  });

  it("and all three name a variable the same way", () => {
    // One concept, one wording. The labels map is copied from the plan by code,
    // so a difference here means a document retyped something it should have
    // read.
    for (const [id, label] of Object.entries(crfFixture.labels)) {
      const declared = sapFixture.variables.find((v) => v.id === id);
      if (declared) expect(label, `${id} on the form`).toBe(declared.label);
    }
    for (const [id, label] of Object.entries(tablesFixture.labels)) {
      const declared = sapFixture.variables.find((v) => v.id === id);
      if (declared) expect(label, `${id} on the tables`).toBe(declared.label);
    }
  });
});
