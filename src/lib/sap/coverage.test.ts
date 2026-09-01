import { describe, expect, it } from "vitest";
import { toFindings } from "./coverage.ts";
import { sapFixture } from "./fixture.ts";
import type { SapSpec } from "./types.ts";

/**
 * A check nobody trusts is a check nobody reads.
 *
 * This one reports things the protocol says and the plan does not, and every
 * false alarm costs more than the finding is worth: a supervisor who is told
 * twice that "Age" is missing when the plan declares "Age" stops reading the
 * rest. So the filter matters as much as the question.
 */

const omission = (over: Partial<Parameters<typeof toFindings>[0][number]> = {}) => ({
  what: "Residual disease after cytoreduction",
  quote: "the completeness of cytoreduction will be recorded as R0, R1 or R2",
  where: "Methods, operative data",
  role: "confounder",
  why_it_matters: "Without it the survival comparison cannot separate the operation from the completeness it achieved.",
  ...over,
});

describe("reading the protocol back against the plan", () => {
  it("reports what the plan does not declare, quoting the protocol", () => {
    const [found] = toFindings([omission()], sapFixture as SapSpec);
    expect(found.code).toBe("COV01");
    expect(found.message).toContain("Residual disease after cytoreduction");
    expect(found.message).toContain("R0, R1 or R2");
    expect(found.message).toContain("Methods, operative data");
    expect(found.message).toContain("It would be a confounder.");
  });

  it("is a warning, because the plan may be right to leave it out", () => {
    // Only the investigator knows whether a thing the protocol mentions belongs
    // in the study. The finding makes the decision conscious, not automatic.
    expect(toFindings([omission()], sapFixture as SapSpec)[0].severity).toBe("WARN");
  });

  it("drops a variable the plan already declares, whatever the case", () => {
    const declared = sapFixture.variables[1].label;
    expect(toFindings([omission({ what: declared.toUpperCase() })], sapFixture as SapSpec)).toEqual([]);
  });

  it("drops one the plan declares as an outcome rather than a variable", () => {
    const outcome = sapFixture.outcomes[0].what;
    expect(toFindings([omission({ what: outcome })], sapFixture as SapSpec)).toEqual([]);
  });

  it("drops an entry with nothing named", () => {
    expect(toFindings([omission({ what: "   " })], sapFixture as SapSpec)).toEqual([]);
  });

  it("says nothing when the plan covers the protocol", () => {
    expect(toFindings([], sapFixture as SapSpec)).toEqual([]);
  });

  it("leaves out the label when the protocol gave no usable one", () => {
    const [found] = toFindings([omission({ where: "  ", role: "unclear" })], sapFixture as SapSpec);
    expect(found.message).not.toContain("()");
    expect(found.message).not.toContain("It would be a");
  });
});
