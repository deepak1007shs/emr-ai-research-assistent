import { describe, expect, it } from "vitest";
import { carriesNote, withoutNote } from "./notes.ts";
import { validateSap } from "./validate.ts";
import { sapFixture } from "./fixture.ts";

/**
 * The blocker reaches the plan and shapes it; it does not narrate itself into
 * the first line a supervisor reads.
 */
describe("the review's commentary", () => {
  const NOTED =
    "Does incisional NPWT reduce total drain output? NOTE: the trial's sample size of 98 is calculated from seroma incidence, not from drain output, so the study as sized may not be powered for this question.";

  it("comes off the question and leaves the question", () => {
    expect(withoutNote(NOTED)).toBe(
      "Does incisional NPWT reduce total drain output?",
    );
  });

  it("comes off a bracketed one too", () => {
    expect(
      withoutNote("Surgical site infection (NOTE: no diagnostic criterion is stated)"),
    ).toBe("Surgical site infection");
  });

  it("leaves a bracket that is part of the study alone", () => {
    for (const kept of [
      "Skeletal muscle index (cm2/m2)",
      "Drain output (ml) at POD 1",
      "Median (IQR) drain output by group",
    ]) {
      expect(withoutNote(kept), kept).toBe(kept);
    }
  });

  it("is recognised wherever it is written", () => {
    expect(carriesNote(NOTED)).toBe(true);
    expect(carriesNote("Surgical site infection (TODO: define it)")).toBe(true);
    expect(carriesNote("Skeletal muscle index (cm2/m2)")).toBe(false);
  });
});

describe("a plan that narrates its blockers", () => {
  it("is told so, rather than having them silently unprinted", () => {
    const spec = structuredClone(sapFixture);
    spec.objectives[0].question += " NOTE: the sample size was computed on a different outcome.";

    const codes = validateSap(spec).findings.map((f) => f.code);
    expect(codes).toContain("MAP18");
  });

  it("and a plan that does not is left alone", () => {
    expect(validateSap(sapFixture).findings.map((f) => f.code)).not.toContain("MAP18");
  });
});
