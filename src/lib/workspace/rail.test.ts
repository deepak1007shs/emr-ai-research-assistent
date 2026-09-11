import { describe, expect, it } from "vitest";
import { loadRail } from "./rail.ts";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * What the rail knows about a protocol: whether it has been reviewed, whether
 * its analysis plan has been built, and what the plan's checks said.
 */

type Row = Record<string, unknown>;

/** A Supabase stub: every builder method returns itself, and awaiting yields rows. */
function client(tables: Record<string, Row[]>): SupabaseClient {
  return {
    from(table: string) {
      const rows = tables[table] ?? [];
      const chain: Record<string, unknown> = {};
      for (const method of ["select", "eq", "not", "order", "limit"]) {
        chain[method] = () => chain;
      }
      chain.then = (resolve: (value: { data: Row[] }) => unknown) => resolve({ data: rows });
      return chain;
    },
  } as unknown as SupabaseClient;
}

const EARLY = "2026-08-01T00:00:00.000Z";

describe("loadRail", () => {
  it("reports a reviewed protocol as reviewed", async () => {
    const [protocol] = await loadRail(
      client({
        protocols: [{ id: "p1", filename: "thesis.pdf", created_at: EARLY }],
        reviews: [{ id: "r1", protocol_id: "p1", answers_updated_at: null }],
      }),
    );
    expect(protocol.filename).toBe("thesis.pdf");
    expect(protocol.documents.review.id).toBe("r1");
    expect(protocol.documents.review.stale).toBe(false);
  });

  it("says a protocol with nothing built has nothing built", async () => {
    const [protocol] = await loadRail(
      client({
        protocols: [{ id: "p2", filename: "other.pdf", created_at: EARLY }],
        reviews: [],
      }),
    );
    expect(protocol.documents.review.id).toBeNull();
  });

  it("takes the newest review where a protocol has been reviewed twice", async () => {
    // The rows arrive newest first, and the rail keeps the first it sees.
    const [protocol] = await loadRail(
      client({
        protocols: [{ id: "p1", filename: "thesis.pdf", created_at: EARLY }],
        reviews: [
          { id: "r2", protocol_id: "p1", answers_updated_at: null },
          { id: "r1", protocol_id: "p1", answers_updated_at: null },
        ],
      }),
    );
    expect(protocol.documents.review.id).toBe("r2");
  });
});

describe("the analysis plan in the rail", () => {
  it("counts the failing checks as errors and the open items as warnings", async () => {
    const [protocol] = await loadRail(
      client({
        protocols: [{ id: "p1", filename: "thesis.pdf", created_at: EARLY }],
        reviews: [],
        sap_plans: [
          {
            id: "s1",
            protocol_id: "p1",
            plan: {
              checks: [{ pass: true }, { pass: false }, { pass: false }],
              todos: ["one", "two"],
            },
          },
        ],
      }),
    );
    expect(protocol.documents.sap.id).toBe("s1");
    expect(protocol.documents.sap.errors).toBe(2);
    expect(protocol.documents.sap.warnings).toBe(2);
  });

  it("says nothing is built where no plan exists", async () => {
    const [protocol] = await loadRail(
      client({
        protocols: [{ id: "p1", filename: "thesis.pdf", created_at: EARLY }],
        reviews: [],
        sap_plans: [],
      }),
    );
    expect(protocol.documents.sap.id).toBeNull();
    expect(protocol.documents.sap.errors).toBe(0);
  });
});
