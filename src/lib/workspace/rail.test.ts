import { describe, expect, it } from "vitest";
import { loadRail } from "./rail.ts";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * The rail is where a supervisor sees that a document has fallen behind.
 *
 * Two ways it can: the plan under it was rebuilt, or the decisions were edited
 * after it was made. Both are worked out from what the rows already carry, so
 * both are worth holding still.
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
const LATE = "2026-08-20T00:00:00.000Z";

const base: Record<string, Row[]> = {
  protocols: [{ id: "p1", filename: "thesis.pdf", created_at: EARLY }],
  reviews: [{ id: "r1", protocol_id: "p1", answers_updated_at: null }],
  sap_plans: [{ id: "s1", protocol_id: "p1", validation: null, created_at: EARLY }],
  crf_forms: [{ id: "c1", protocol_id: "p1", sap_id: "s1", validation: null, created_at: EARLY }],
  shell_tables: [{ id: "t1", protocol_id: "p1", sap_id: "s1", validation: null, created_at: EARLY }],
};

describe("loadRail", () => {
  it("reports every document as ready when they agree", async () => {
    const [protocol] = await loadRail(client(structuredClone(base)));
    expect(protocol.documents.sap.id).toBe("s1");
    expect(protocol.documents.crf.stale).toBe(false);
    expect(protocol.documents.crf.behindAnswers).toBe(false);
  });

  it("marks a form built from a superseded plan", async () => {
    const tables = structuredClone(base);
    // The plan was rebuilt; the form still points at the old one.
    tables.sap_plans.unshift({ id: "s2", protocol_id: "p1", validation: null, created_at: LATE });
    const [protocol] = await loadRail(client(tables));
    expect(protocol.documents.sap.id).toBe("s2");
    expect(protocol.documents.crf.stale).toBe(true);
  });

  it("marks a document built before the decisions were last edited", async () => {
    const tables = structuredClone(base);
    tables.reviews = [{ id: "r1", protocol_id: "p1", answers_updated_at: LATE }];
    const [protocol] = await loadRail(client(tables));
    expect(protocol.documents.sap.behindAnswers).toBe(true);
    expect(protocol.documents.crf.behindAnswers).toBe(true);
  });

  it("does not mark a document built after the decisions", async () => {
    const tables = structuredClone(base);
    tables.reviews = [{ id: "r1", protocol_id: "p1", answers_updated_at: EARLY }];
    tables.sap_plans = [{ id: "s1", protocol_id: "p1", validation: null, created_at: LATE }];
    const [protocol] = await loadRail(client(tables));
    expect(protocol.documents.sap.behindAnswers).toBe(false);
  });

  it("counts the findings recorded when each document was built", async () => {
    const tables = structuredClone(base);
    tables.sap_plans = [
      {
        id: "s1",
        protocol_id: "p1",
        created_at: EARLY,
        validation: {
          findings: [
            { severity: "ERROR", code: "REF04", message: "x" },
            { severity: "WARN", code: "ADJ03", message: "y" },
          ],
        },
      },
    ];
    const [protocol] = await loadRail(client(tables));
    expect(protocol.documents.sap.errors).toBe(1);
    expect(protocol.documents.sap.warnings).toBe(1);
  });

  it("says a protocol with nothing built has nothing built", async () => {
    const [protocol] = await loadRail(
      client({ protocols: base.protocols, reviews: [], sap_plans: [], crf_forms: [], shell_tables: [] }),
    );
    for (const kind of ["review", "sap", "crf"] as const) {
      expect(protocol.documents[kind].id).toBeNull();
      expect(protocol.documents[kind].stale).toBe(false);
    }
  });
});
