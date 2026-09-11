import { describe, expect, it } from "vitest";
import { STAGES, STAGE_LABEL, isStalled, stagesOf } from "./plan.ts";

/**
 * What is left of the job plan.
 *
 * This file held the order four documents had to be built in, what each needed
 * before it could start, and the wording for refusing a stage whose
 * prerequisite was missing. The plan, the shell tables and the case record form
 * were removed; a chain of one has no order to get wrong. What still has a rule
 * in it is the stall.
 */
describe("the one stage", () => {
  it("is the review, and a job runs exactly it", () => {
    expect(STAGES).toEqual(["review"]);
    expect(stagesOf()).toEqual(["review"]);
    expect(STAGE_LABEL.review).toBe("Protocol Review");
  });
});

describe("a job whose server died", () => {
  const at = (minutes: number) => ({
    status: "running",
    updated_at: new Date(Date.UTC(2026, 0, 1, 12, 0, 0)).toISOString(),
    now: Date.UTC(2026, 0, 1, 12, minutes, 0),
  });

  it("is stalled once nobody has written to it for ten minutes", () => {
    const row = at(11);
    expect(isStalled(row, row.now)).toBe(true);
  });

  it("is not stalled while the writes are still coming", () => {
    const row = at(9);
    expect(isStalled(row, row.now)).toBe(false);
  });

  it("is never stalled once it has finished, however long ago", () => {
    const row = { ...at(600), status: "done" };
    expect(isStalled(row, row.now)).toBe(false);
  });
});
