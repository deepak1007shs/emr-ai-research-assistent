import { describe, expect, it } from "vitest";
import { MUTATIONS } from "./test_invariants";
import { validate } from "./validate_study_spec";
import example from "./example_study_spec.json";

/**
 * Every guard is proved by breaking a clean spec in exactly one way. A mutation
 * that stops firing means the guard has rotted — which is the failure a test
 * suite exists to catch.
 */
describe("every guard fires on its own mutation", () => {
  it.each(MUTATIONS.map((m) => [`${m.code} — ${m.why}`, m] as const))(
    "%s",
    (_label, mutation) => {
      const broken = mutation.mutate(
        JSON.parse(JSON.stringify(example)) as Record<string, unknown>,
      );
      const codes = validate(broken).findings.map((f) => f.code);
      expect(codes).toContain(mutation.code);
    },
  );

  it("has no duplicate mutations", () => {
    const codes = MUTATIONS.map((m) => m.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("leaves the unmutated example passing the submission gate", () => {
    expect(validate(example, { final: true }).ok).toBe(true);
  });
});
