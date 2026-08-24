import { describe, expect, it } from "vitest";
import { validate } from "./validate_study_spec";
import example from "./example_study_spec.json";

/**
 * The JSON import narrows every literal to its exact value, and `open_items: []`
 * to `never[]`, which blocks the deliberate mutations below. This is the
 * mutable view the tests need — only the fields they actually touch.
 */
type MutableSpec = {
  study: { design: string };
  objectives?: unknown;
  open_items: { id: string; question: string; owner: string }[];
};

const clone = () => structuredClone(example) as unknown as MutableSpec;

/**
 * The example spec is the fixture every invariant test mutates. If this file
 * fails, the fixture is broken and every other spec test is meaningless.
 */
describe("validate", () => {
  it("passes the example spec with no errors", () => {
    const { ok, findings } = validate(example);
    const errors = findings.filter((f) => f.severity === "ERROR");
    expect(errors, JSON.stringify(errors, null, 2)).toEqual([]);
    expect(ok).toBe(true);
  });

  it("reports a shape violation with the path to the offending value", () => {
    const broken = clone();
    broken.study.design = "not-a-design";
    const { ok, findings } = validate(broken);
    expect(ok).toBe(false);
    expect(findings.some((f) => f.path === "study.design")).toBe(true);
  });

  it("stops before the cross-object checks when the shape is broken", () => {
    const broken = clone();
    delete broken.objectives;
    const { findings } = validate(broken);
    // Only shape findings — running OBJ01 on a spec with no objectives is noise.
    expect(findings.every((f) => f.code.startsWith("SHP"))).toBe(true);
  });

  it("--final blocks on unresolved open items", () => {
    const withOpen = clone();
    withOpen.open_items = [
      { id: "open_1", question: "Confirm the MCID with the guide", owner: "Guide" },
    ];
    expect(validate(withOpen).ok).toBe(true);
    expect(validate(withOpen, { final: true }).ok).toBe(false);
  });
});
