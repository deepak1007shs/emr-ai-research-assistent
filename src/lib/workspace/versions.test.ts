import { describe, expect, it } from "vitest";
import { loadVersions } from "./versions.ts";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * The version list is where a document gets deleted from, so what it calls
 * "current" has to be what the rest of the app calls current: the newest ready
 * row. Getting that wrong would offer the wrong row for deletion.
 */

type Row = Record<string, unknown>;

function client(rows: Row[]): SupabaseClient {
  return {
    from() {
      const chain: Record<string, unknown> = {};
      for (const method of ["select", "eq", "order"]) chain[method] = () => chain;
      chain.then = (resolve: (v: { data: Row[] }) => unknown) => resolve({ data: rows });
      return chain;
    },
  } as unknown as SupabaseClient;
}

const row = (id: string, created: string, status = "ready", validation: unknown = null) => ({
  id,
  status,
  validation,
  created_at: created,
});

describe("loadVersions", () => {
  it("marks the newest ready row current, and only that one", async () => {
    const versions = await loadVersions(
      client([
        row("c", "2026-08-20T00:00:00.000Z"),
        row("b", "2026-08-10T00:00:00.000Z"),
        row("a", "2026-08-01T00:00:00.000Z"),
      ]),
      "sap",
      "p1",
    );
    expect(versions.map((v) => v.id)).toEqual(["c", "b", "a"]);
    expect(versions.filter((v) => v.current).map((v) => v.id)).toEqual(["c"]);
  });

  it("skips a failed row when deciding what is current", async () => {
    // A build that failed is newest but is not the document.
    const versions = await loadVersions(
      client([
        row("failed", "2026-08-20T00:00:00.000Z", "failed"),
        row("good", "2026-08-10T00:00:00.000Z"),
      ]),
      "sap",
      "p1",
    );
    expect(versions.find((v) => v.current)?.id).toBe("good");
  });

  it("counts the problems recorded against each version", async () => {
    const versions = await loadVersions(
      client([
        row("a", "2026-08-01T00:00:00.000Z", "ready", {
          findings: [
            { severity: "ERROR", code: "REF04", message: "x" },
            { severity: "WARN", code: "ADJ03", message: "y" },
          ],
        }),
      ]),
      "sap",
      "p1",
    );
    expect(versions[0].errors).toBe(1);
    expect(versions[0].warnings).toBe(1);
  });

  it("says nothing when nothing was ever built", async () => {
    expect(await loadVersions(client([]), "crf", "p1")).toEqual([]);
  });
});
