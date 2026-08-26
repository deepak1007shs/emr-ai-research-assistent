import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * What the left rail knows.
 *
 * Every protocol the user owns, each with the state of its four documents. The
 * rail is rendered by the layout, which App Router does not re-render when you
 * move between the documents of one protocol, so this runs once per protocol
 * rather than once per document.
 *
 * "Current" is resolved the way the rest of the app resolves it: the artifact
 * tables are insert-only, so the newest ready row wins.
 */

export type DocKind = "review" | "sap" | "crf" | "tables";

export const DOC_LABEL: Record<DocKind, string> = {
  review: "Protocol Review",
  sap: "Statistical Analysis Plan",
  crf: "Case Report Form",
  tables: "Shell Tables",
};

/** The short form, for the rail where the protocol name already takes the width. */
export const DOC_SHORT: Record<DocKind, string> = {
  review: "Review",
  sap: "SAP",
  crf: "CRF",
  tables: "Shell Tables",
};

export const DOC_ORDER: DocKind[] = ["review", "sap", "crf", "tables"];

export type DocState = {
  kind: DocKind;
  id: string | null;
  /** Present but built from an older analysis plan, so its wording may disagree. */
  stale: boolean;
  /** Errors and warnings recorded when it was built. */
  errors: number;
  warnings: number;
};

export type ProtocolRow = {
  id: string;
  filename: string;
  created_at: string;
  documents: Record<DocKind, DocState>;
};

type Finding = { severity: "ERROR" | "WARN" };

function countFindings(validation: unknown): { errors: number; warnings: number } {
  const findings = (validation as { findings?: Finding[] } | null)?.findings ?? [];
  return {
    errors: findings.filter((f) => f.severity === "ERROR").length,
    warnings: findings.filter((f) => f.severity === "WARN").length,
  };
}

/** The newest row per protocol, from a list already ordered newest first. */
function newestByProtocol<T extends { protocol_id: string }>(rows: T[] | null): Map<string, T> {
  const latest = new Map<string, T>();
  for (const row of rows ?? []) {
    if (!latest.has(row.protocol_id)) latest.set(row.protocol_id, row);
  }
  return latest;
}

export async function loadRail(supabase: SupabaseClient): Promise<ProtocolRow[]> {
  const ready = (table: string, columns: string) =>
    supabase
      .from(table)
      .select(columns)
      .eq("status", "ready")
      .order("created_at", { ascending: false });

  const [protocols, reviews, saps, crfs, tables] = await Promise.all([
    supabase.from("protocols").select("id, filename, created_at").order("created_at", { ascending: false }),
    supabase
      .from("reviews")
      .select("id, protocol_id")
      .eq("status", "complete")
      .order("created_at", { ascending: false }),
    ready("sap_plans", "id, protocol_id, validation"),
    ready("crf_forms", "id, protocol_id, sap_id, validation"),
    ready("shell_tables", "id, protocol_id, sap_id, validation"),
  ]);

  const latestReview = newestByProtocol(reviews.data as unknown as { protocol_id: string; id: string }[]);
  const latestSap = newestByProtocol(
    saps.data as unknown as { protocol_id: string; id: string; validation: unknown }[],
  );
  const latestCrf = newestByProtocol(
    crfs.data as unknown as { protocol_id: string; id: string; sap_id: string | null; validation: unknown }[],
  );
  const latestTables = newestByProtocol(
    tables.data as unknown as { protocol_id: string; id: string; sap_id: string | null; validation: unknown }[],
  );

  return ((protocols.data as { id: string; filename: string; created_at: string }[] | null) ?? []).map(
    (protocol) => {
      const sap = latestSap.get(protocol.id) ?? null;
      const crf = latestCrf.get(protocol.id) ?? null;
      const shell = latestTables.get(protocol.id) ?? null;
      const review = latestReview.get(protocol.id) ?? null;

      // A document built from a superseded plan describes the study by the
      // wording that plan carried, which is no longer the wording in force.
      const staleAgainstSap = (row: { sap_id: string | null } | null) =>
        Boolean(row && sap && row.sap_id !== sap.id);

      return {
        id: protocol.id,
        filename: protocol.filename,
        created_at: protocol.created_at,
        documents: {
          review: { kind: "review", id: review?.id ?? null, stale: false, errors: 0, warnings: 0 },
          sap: { kind: "sap", id: sap?.id ?? null, stale: false, ...countFindings(sap?.validation) },
          crf: {
            kind: "crf",
            id: crf?.id ?? null,
            stale: staleAgainstSap(crf),
            ...countFindings(crf?.validation),
          },
          tables: {
            kind: "tables",
            id: shell?.id ?? null,
            stale: staleAgainstSap(shell),
            ...countFindings(shell?.validation),
          },
        },
      };
    },
  );
}
