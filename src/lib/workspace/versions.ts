import type { SupabaseClient } from "@supabase/supabase-js";
import type { Finding } from "../sap/validate.ts";

/**
 * Every version of one document, newest first.
 *
 * The artifact tables are insert-only: each rebuild adds a row and the newest
 * ready one is the current document. That has always been a version history;
 * this is what makes it visible, so an old version can be downloaded or thrown
 * away rather than sitting there unnamed.
 */

export type DocumentVersion = {
  id: string;
  createdAt: string;
  /** True for the row the app treats as the document. */
  current: boolean;
  errors: number;
  warnings: number;
  status: string;
};

const TABLE = {
  sap: "sap_plans",
  crf: "crf_forms",
  tables: "shell_tables",
} as const;

export type VersionedKind = keyof typeof TABLE;

export async function loadVersions(
  supabase: SupabaseClient,
  kind: VersionedKind,
  protocolId: string,
): Promise<DocumentVersion[]> {
  const { data } = await supabase
    .from(TABLE[kind])
    .select("id, status, validation, created_at")
    .eq("protocol_id", protocolId)
    .order("created_at", { ascending: false });

  const rows = (data ?? []) as unknown as {
    id: string;
    status: string;
    validation: { findings?: Finding[] } | null;
    created_at: string;
  }[];

  // Current means what the rest of the app means by it: the newest ready row.
  const currentId = rows.find((r) => r.status === "ready")?.id;

  return rows.map((row) => {
    const findings = row.validation?.findings ?? [];
    return {
      id: row.id,
      createdAt: row.created_at,
      current: row.id === currentId,
      status: row.status,
      errors: findings.filter((f) => f.severity === "ERROR").length,
      warnings: findings.filter((f) => f.severity === "WARN").length,
    };
  });
}
