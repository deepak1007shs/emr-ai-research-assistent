import { describe, expect, it, vi } from "vitest";
import { DOC_ORDER } from "../workspace/rail.ts";
import { NEEDS, STAGES, isStalled, needsFirst, stagesOf } from "./plan.ts";
import { hasPrerequisite } from "./run.ts";

/**
 * The order is the point of this change.
 *
 * Nothing stopped a plan being built for a protocol nobody had reviewed. It
 * never happened, because the only route to the plan was through the review -
 * but that is a habit, not a rule, and a chain that can be started from
 * anywhere breaks the habit. The dependency is real: the plan is written
 * against the review's findings and the investigator's answers to them.
 */

describe("the order the documents depend on", () => {
  it("shows the rail every stage the rail has a place for", () => {
    // The rail lists the documents a reader opens. The shell tables are not one
    // of them any more - they are Section 6 of the plan - so the two lists are
    // no longer equal, and what must hold is that the rail has a place for
    // everything the server builds and offers to build.
    expect(STAGES.filter((s) => s !== "tables")).toEqual(DOC_ORDER);
  });

  it("puts the review first and hangs everything else off the plan", () => {
    expect(NEEDS).toEqual({
      review: null,
      sap: "review",
      crf: "sap",
      tables: "sap",
    });
  });

  it("runs a chain in that order, and a single document alone", () => {
    expect(stagesOf("all")).toEqual(["review", "sap", "tables", "crf"]);
    expect(stagesOf("documents")).toEqual(["sap", "tables", "crf"]);
    expect(stagesOf("crf")).toEqual(["crf"]);
    // The plan carries its tables, so asking for one asks for both.
    expect(stagesOf("sap")).toEqual(["sap", "tables"]);
  });

  it("starts a chain at a stage whose own prerequisite is checked", () => {
    // "documents" begins at the plan, so the review still has to exist. The
    // build route checks the first stage of the chain and no other, which is
    // only correct because every later stage is built by the chain itself.
    expect(NEEDS[stagesOf("documents")[0]]).toBe("review");
    expect(NEEDS[stagesOf("all")[0]]).toBe(null);
  });

  it("says what is missing in words a reader can act on", () => {
    expect(needsFirst("review")).toBeNull();
    expect(needsFirst("sap")).toContain("Protocol Review");
    expect(needsFirst("crf")).toContain("Statistical Analysis Plan");
    expect(needsFirst("tables")).toContain("Statistical Analysis Plan");
    // Not a code, not an id, and not the name of a table.
    for (const stage of STAGES) {
      expect(needsFirst(stage) ?? "").not.toMatch(/sap_plans|crf_forms|shell_tables|404|409/);
    }
  });
});

describe("a job whose server died", () => {
  const at = (minutesAgo: number) =>
    new Date(Date.parse("2026-01-01T12:00:00Z") - minutesAgo * 60_000).toISOString();
  const now = Date.parse("2026-01-01T12:00:00Z");

  it("is still running while it is being written to", () => {
    expect(isStalled({ status: "running", updated_at: at(2) }, now)).toBe(false);
    expect(isStalled({ status: "running", updated_at: at(9) }, now)).toBe(false);
  });

  it("is stalled once nothing has written to it for ten minutes", () => {
    // after() lives in the process that served the request. Restart the server
    // and the row says "running" for ever with nothing left to move it on.
    expect(isStalled({ status: "running", updated_at: at(11) }, now)).toBe(true);
  });

  it("is never stalled once it has finished", () => {
    expect(isStalled({ status: "done", updated_at: at(600) }, now)).toBe(false);
    expect(isStalled({ status: "failed", updated_at: at(600) }, now)).toBe(false);
  });
});

/** Enough of a Supabase client to answer the two questions the gate asks. */
function fakeDb(has: { review?: boolean; sap?: boolean }) {
  const reviews = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    then: (resolve: (v: unknown) => void) => resolve({ count: has.review ? 1 : 0 }),
  };
  const saps = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: has.sap ? { id: "s1", spec: {} } : null }),
  };
  return {
    from: (table: string) => (table === "reviews" ? reviews : saps),
  } as never;
}

describe("the gate that refuses before anything is spent", () => {
  it("lets the review run against a protocol with nothing at all", async () => {
    expect(await hasPrerequisite(fakeDb({}), "p1", "review")).toBe(true);
  });

  it("refuses the plan until the protocol has been reviewed", async () => {
    expect(await hasPrerequisite(fakeDb({}), "p1", "sap")).toBe(false);
    expect(await hasPrerequisite(fakeDb({ review: true }), "p1", "sap")).toBe(true);
  });

  it("refuses the form and the tables until the plan exists", async () => {
    for (const stage of ["crf", "tables"] as const) {
      expect(await hasPrerequisite(fakeDb({ review: true }), "p1", stage)).toBe(false);
      expect(await hasPrerequisite(fakeDb({ review: true, sap: true }), "p1", stage)).toBe(true);
    }
  });
});
