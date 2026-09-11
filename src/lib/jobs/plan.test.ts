import { describe, expect, it } from "vitest";
import { STAGES, STAGE_LABEL, isStalled, stagesOf } from "./plan.ts";

/**
 * The job plan: which stages a job runs, in which order, and when a job is
 * dead.
 */
describe("the stages", () => {
  it("are the review and the plan, in that order", () => {
    expect(STAGES).toEqual(["review", "sap"]);
    expect(STAGE_LABEL.review).toBe("Protocol Review");
    expect(STAGE_LABEL.sap).toBe("Statistical Analysis Plan");
  });

  it("runs exactly the one asked for", () => {
    expect(stagesOf("review")).toEqual(["review"]);
    expect(stagesOf("sap")).toEqual(["sap"]);
  });

  it("runs the review before the plan when both are asked for", () => {
    // The plan does not need the review to have run. It is put first because
    // the review's blockers are what the investigator answers before the plan
    // is worth freezing, and answering them after it is built means building
    // it twice.
    expect(stagesOf("both")).toEqual(["review", "sap"]);
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
