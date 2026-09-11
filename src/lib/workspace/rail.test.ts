import { describe, expect, it } from "vitest";
import { loadRail } from "./rail.ts";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * What the rail knows about a protocol.
 *
 * It used to track two more documents and the two ways each could fall behind:
 * the plan under it rebuilt, or the decisions edited after it was made. The
 * plan and the form were removed, and a review can fall behind neither. What is
 * left is which protocols exist and whether each has been reviewed.
 */

type Row = Record<string, unknown>;

/** A Supabase stub: every builder method returns itself, and awaiting yields rows. */
function client(tables: Record<string, Row[]>): SupabaseClient {
  return {
    from(table: string) {
      const rows = tables[table] ?? [];
      const chain: Record<string, unknown> = {};
      for (const method of ["select", "eq", "order", "limit"]) {
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
