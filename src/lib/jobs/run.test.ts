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
const fail = new Set<string>();
const findings = new Map<string, { severity: "ERROR" | "WARN" }[]>();

const usage = {
  input_tokens: 10,
  output_tokens: 10,
  cache_creation_input_tokens: 0,
  cache_read_input_tokens: 0,
};

function stub(name: string, spec: unknown) {
  return async () => {
    calls.push(name);
    if (fail.has(name)) throw new Error(`${name} blew up`);
    return { spec, findings: findings.get(name) ?? [], model: "claude-sonnet-5", usage };
  };
}

vi.mock("../protocol/extract.ts", () => ({
  extractProtocol: async () => ({ kind: "text", filename: "p.txt", text: "..." }),
}));
vi.mock("../render/markdown.ts", () => ({ build: () => "# markdown" }));
vi.mock("../workspace/decisions.ts", () => ({
  loadDecisions: async () => ({ reviewId: "rev-1", answers: null }),
}));
vi.mock("../protocol/analyze.ts", async (original) => ({
  ...(await original<Record<string, unknown>>()),
  analyzeProtocol: async () => {
    calls.push("review");
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
      return { data: null, error: null };
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
  calls.length = 0;
  fail.clear();
  findings.clear();
  jobPatches = [];
  inserted = [];
  has = { review: false, sap: false };
});

describe("a chain", () => {
  it("runs the four stages in the order they depend on each other", async () => {
    await run("all");
    expect(calls).toEqual(["review", "sap", "crf", "tables"]);
    expect(finalPatch().status).toBe("done");
  });

  it("starts at the plan when the review is already written", async () => {
    has.review = true;
    await run("documents");
    expect(calls).toEqual(["sap", "crf", "tables"]);
  });

  it("carries on past a document that was built with problems in it", async () => {
    // Every plan this app has built has findings. Stopping on them would mean
    // the form is never reached, which is worse than reaching it.
    findings.set("sap", [{ severity: "ERROR" }, { severity: "WARN" }]);
    await run("all");
    expect(calls).toEqual(["review", "sap", "crf", "tables"]);
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

  it("records a failed plan rather than leaving nothing behind", async () => {
    fail.add("sap");
    await run("all");
    const rows = inserted.filter((i) => i.table === "sap_plans");
    expect(rows).toHaveLength(1);
    expect(rows[0].row).toMatchObject({ status: "failed", protocol_id: "p1" });
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
