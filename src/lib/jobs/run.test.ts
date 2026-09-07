import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * What the chain does when a stage goes wrong.
 *
 * Two different things can go wrong and they must not be treated alike. A stage
 * that produces nothing ends the run, because everything after it would be
 * built against nothing. A stage that produces a document carrying findings
 * does not: every plan this app has ever built carries findings, and a chain
 * that stopped on those would never once reach the form.
 *
 * The builders are stubbed. What is under test is the order and the stopping,
 * which is the part this change added.
 */

const calls: string[] = [];
/** What each builder was handed, so the wiring can be asserted rather than assumed. */
const given = new Map<string, Record<string, unknown>>();
const fail = new Set<string>();
const findings = new Map<string, { severity: "ERROR" | "WARN" }[]>();

/**
 * Three blockers the review raised and nobody answered: one for the plan, one
 * for the form, one it could not place.
 */
const BLOCKERS = [
  { affects: "sap", kind: "outcome_ambiguous", target: "the primary outcome", issue: "Two primary outcomes are named." },
  { affects: "crf", kind: "variable_missing", target: "ASA grade", issue: "The model adjusts for it and nothing collects it." },
  { affects: "tables", kind: "definition_missing", target: "the composite endpoint", issue: "Its components are not listed." },
  { affects: "none", kind: "none", target: "", issue: "The consent form is out of date." },
] as const;

const usage = {
  input_tokens: 10,
  output_tokens: 10,
  cache_creation_input_tokens: 0,
  cache_read_input_tokens: 0,
};

function stub(name: string, spec: unknown) {
  // The options are always the last argument, whatever the builder's shape.
  // Metering before the throw is what really happens: a call that is cut off
  // has already generated everything it is going to be billed for.
  return async (...args: unknown[]) => {
    calls.push(name);
    if (stopAfter > 0) stopAfter -= 1;
    const options = args[args.length - 1] as
      | { onUsage?: (u: typeof usage) => void; unresolved?: unknown[] }
      | undefined;
    given.set(name, (options ?? {}) as Record<string, unknown>);
    options?.onUsage?.(usage);
    if (fail.has(name)) throw new Error(`${name} blew up`);
    return { spec, findings: findings.get(name) ?? [], model: "claude-sonnet-5", usage };
  };
}

vi.mock("../protocol/extract.ts", () => ({
  extractProtocol: async () => ({ kind: "text", filename: "p.txt", text: "..." }),
}));
vi.mock("../render/markdown.ts", () => ({ build: () => "# markdown" }));
vi.mock("../workspace/decisions.ts", () => ({
  loadDecisions: async () => ({
    reviewId: "rev-1",
    answers: null,
    consequences: BLOCKERS,
    unanswered: BLOCKERS,
  }),
}));
vi.mock("../protocol/analyze.ts", async (original) => ({
  ...(await original<Record<string, unknown>>()),
  analyzeProtocol: async () => {
    calls.push("review");
    if (stopAfter > 0) stopAfter -= 1;
    if (fail.has("review")) throw new Error("review blew up");
    return { spec: {}, actionSpec: {}, model: "claude-sonnet-5", usage };
  },
}));
vi.mock("../sap/build.ts", () => ({ buildSapSpec: stub("sap", { variables: [{ id: "v1" }] }) }));
vi.mock("../sap/coverage.ts", () => ({
  checkCoverage: async () => ({ findings: [], usage, model: "claude-sonnet-5" }),
}));
vi.mock("../crf/build.ts", () => ({ buildCrfSpec: stub("crf", {}) }));
vi.mock("../tables/build.ts", () => ({ buildTablesSpec: stub("tables", {}) }));
// The plan the form and the tables are built against carries ids in this app's
// current shape; the stub above is not that shape, so the linkability check is
// answered here rather than by faking a whole registry.
vi.mock("../sap/types.ts", async (original) => ({
  ...(await original<Record<string, unknown>>()),
  isLinkable: () => true,
}));

const { runJob } = await import("./run.ts");

/* -------------------------------------------------------------------------- */

type Result = { data?: unknown; error?: unknown; count?: number };

/** The rows the fake database has, and the writes it took. */
let has: { review: boolean; sap: boolean };
/** Stages to let through before the row reports a Stop. -1 never stops. */
let stopAfter: number;
let jobPatches: Record<string, unknown>[];
let inserted: { table: string; row: Record<string, unknown> }[];

function makeDb() {
  const resolve = (table: string, ops: { name: string; args: unknown[] }[]): Result => {
    const insert = ops.find((o) => o.name === "insert");
    if (insert) {
      const row = insert.args[0] as Record<string, unknown>;
      inserted.push({ table, row });
      // A stage reads what the stage before it wrote. The form is not merely
      // gated on the plan; it is built from the plan's spec, so a fake that
      // kept saying there was none would test nothing the chain does.
      if (table === "sap_plans" && row.status === "ready") has.sap = true;
      if (table === "reviews") has.review = true;
      return { data: { id: `${table}-1` }, error: null };
    }
    if (table === "jobs") {
      const update = ops.find((o) => o.name === "update");
      if (update) jobPatches.push(update.args[0] as Record<string, unknown>);
      // A read of the row is the runner asking whether Stop has been pressed.
      return { data: { status: stopAfter === 0 ? "cancelled" : "running" }, error: null };
    }
    if (table === "reviews") {
      return { count: has.review ? 1 : 0, data: has.review ? { id: "rev-1" } : null };
    }
    if (table === "sap_plans") {
      return { data: has.sap ? { id: "sap-0", spec: { variables: [{ id: "v1" }] } } : null };
    }
    if (table === "protocols") {
      return { data: { id: "p1", filename: "p.txt", storage_path: "u/p1/p.txt", mime: "text/plain" } };
    }
    return { data: null };
  };

  const chain = (table: string) => {
    const ops: { name: string; args: unknown[] }[] = [];
    const proxy: unknown = new Proxy(
      {},
      {
        get(_target, prop) {
          if (prop === "then") {
            return (ok?: (v: Result) => unknown, no?: (e: unknown) => unknown) =>
              Promise.resolve(resolve(table, ops)).then(ok, no);
          }
          return (...args: unknown[]) => {
            ops.push({ name: String(prop), args });
            return prop === "single" || prop === "maybeSingle"
              ? Promise.resolve(resolve(table, ops))
              : proxy;
          };
        },
      },
    );
    return proxy;
  };

  return {
    from: chain,
    storage: {
      from: () => ({
        download: async () => ({
          data: { arrayBuffer: async () => new TextEncoder().encode("protocol").buffer },
          error: null,
        }),
      }),
    },
  } as never;
}

const run = (kind: "all" | "documents" | "sap" | "crf") =>
  runJob(makeDb(), { id: "job-1", kind, protocolId: "p1", userId: "u1" });

const finalPatch = () => jobPatches[jobPatches.length - 1];

beforeEach(() => {
  given.clear();
  calls.length = 0;
  fail.clear();
  findings.clear();
  jobPatches = [];
  inserted = [];
  has = { review: false, sap: false };
  stopAfter = -1;
});

describe("a chain", () => {
  it("runs the four stages in the order they depend on each other", async () => {
    await run("all");
    expect(calls).toEqual(["review", "sap", "tables", "crf"]);
    expect(finalPatch().status).toBe("done");
  });

  it("starts at the plan when the review is already written", async () => {
    has.review = true;
    await run("documents");
    expect(calls).toEqual(["sap", "tables", "crf"]);
  });

  it("carries on past a document that was built with problems in it", async () => {
    // Every plan this app has built has findings. Stopping on them would mean
    // the form is never reached, which is worse than reaching it.
    findings.set("sap", [{ severity: "ERROR" }, { severity: "WARN" }]);
    await run("all");
    expect(calls).toEqual(["review", "sap", "tables", "crf"]);
    expect(finalPatch().status).toBe("done");

    const produced = jobPatches.flatMap((p) => (p.produced ? [p.produced] : [])).pop() as {
      kind: string;
      errors: number;
      warnings: number;
    }[];
    expect(produced.find((p) => p.kind === "sap")).toMatchObject({ errors: 1, warnings: 1 });
  });

  it("stops at a stage that produced nothing, and does not run what came after", async () => {
    fail.add("sap");
    await run("all");
    expect(calls).toEqual(["review", "sap"]);
    expect(calls).not.toContain("crf");
    expect(finalPatch().status).toBe("failed");
  });

  it("names the stage that failed and what was finished before it", async () => {
    fail.add("crf");
    await run("all");
    const message = String(finalPatch().error);
    expect(message).toContain("crf blew up");
    expect(message).toContain("Protocol Review and Statistical Analysis Plan");
  });

  it("hands every open blocker to the plan, and only its own to the others", async () => {
    // The plan is the root the other two are built from, so a blocker the
    // review mislabelled would be lost from the whole chain if it were routed.
    // The form and the tables get what affects them.
    await run("all");

    const sent = (name: string) =>
      ((given.get(name)?.unresolved ?? []) as { target: string }[]).map((c) => c.target);

    expect(sent("sap")).toEqual(BLOCKERS.map((b) => b.target));
    expect(sent("crf")).toEqual(["ASA grade"]);
    expect(sent("tables")).toEqual(["the composite endpoint"]);
    // A builder handed nothing and a builder handed no option look the same
    // from here, and one of them is a wiring bug. Assert the option exists.
    for (const stage of ["sap", "tables", "crf"]) {
      expect(given.get(stage), stage).toHaveProperty("unresolved");
    }
  });

  it("records a failed plan rather than leaving nothing behind", async () => {
    fail.add("sap");
    await run("all");
    const rows = inserted.filter((i) => i.table === "sap_plans");
    expect(rows).toHaveLength(1);
    expect(rows[0].row).toMatchObject({ status: "failed", protocol_id: "p1" });
  });

  it("records a failed form and a failed set of tables too", async () => {
    // The plan wrote a failed row from the day it was written and the two
    // documents under it did not, so a form that failed left the workspace
    // showing nothing rather than showing what went wrong.
    fail.add("tables");
    await run("all");
    const rows = inserted.filter((i) => i.table === "shell_tables");
    expect(rows).toHaveLength(1);
    expect(rows[0].row).toMatchObject({ status: "failed", protocol_id: "p1" });
    expect(String(rows[0].row.error)).toContain("tables blew up");
  });

  it("keeps what a failed stage spent", async () => {
    // The bill is charged whether or not the document arrives. A failure that
    // reports nothing spent is not free; it is unrecorded, and every estimate
    // built on these numbers is short by the cost of every failure.
    //
    // The first stage fails, so nothing is banked and the only tokens in the
    // run are the ones the failure itself burned. A later stage would pass this
    // on the stages that succeeded before it while still losing its own.
    has.review = true;
    fail.add("sap");
    await run("documents");

    expect(finalPatch().status).toBe("failed");
    expect(finalPatch().usage).toMatchObject({ output_tokens: usage.output_tokens });
    expect(Number(finalPatch().cost)).toBeGreaterThan(0);
  });
});

describe("a single document", () => {
  it("refuses to build a plan for a protocol nobody has reviewed", async () => {
    await run("sap");
    expect(calls).toEqual([]);
    expect(String(finalPatch().error)).toContain("Protocol Review");
    // Refused before the model was reached, so nothing was spent and no failed
    // row was written for a build that never started.
    expect(inserted.filter((i) => i.table === "sap_plans")).toHaveLength(0);
  });

  it("refuses to build a form for a protocol with no plan", async () => {
    has.review = true;
    await run("crf");
    expect(calls).toEqual([]);
    expect(String(finalPatch().error)).toContain("Statistical Analysis Plan");
  });

  it("builds one when what it depends on is already there", async () => {
    has.review = true;
    has.sap = true;
    await run("crf");
    expect(calls).toEqual(["crf"]);
    expect(finalPatch().status).toBe("done");
  });
});

describe("stopping a build", () => {
  it("keeps what finished and does not run what had not started", async () => {
    // Stop after the review. The plan, the tables and the form never begin, and
    // the review that finished stays: it is built and paid for.
    stopAfter = 1;
    await run("all");

    expect(calls).toEqual(["review"]);
    expect(finalPatch().status).toBe("cancelled");
    expect(String(finalPatch().error)).toContain("Protocol Review");
    expect(String(finalPatch().error)).toContain("kept");
  });

  it("is not a failure", async () => {
    // A build you stopped on purpose must not sit in the history looking like
    // a crash, because one is worth investigating and the other is not.
    stopAfter = 1;
    await run("all");
    expect(finalPatch().status).not.toBe("failed");
  });

  it("leaves no failed document behind", async () => {
    stopAfter = 1;
    await run("all");
    const failed = inserted.filter((i) => i.row.status === "failed");
    expect(failed).toEqual([]);
  });

  it("says so plainly when nothing had been built yet", async () => {
    stopAfter = 0;
    await run("all");
    expect(calls).toEqual([]);
    expect(String(finalPatch().error)).toContain("before anything was built");
  });
});
