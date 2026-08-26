import type { SupabaseClient } from "@supabase/supabase-js";
import type { Finding } from "../sap/validate.ts";

/**
 * Loading one built document for the page that shows it.
 *
 * The artifact tables are insert-only, so the newest ready row is the current
 * one. This is the same resolution the API routes use; it lives here so the
 * three document pages do not each write it out again.
 */

export type StoredDocument<T> = {
  id: string;
  spec: T;
  findings: Finding[];
  /** The plan it was built from, for the pages that care whether it has moved on. */
  sapId: string | null;
  createdAt: string;
};

export async function loadCurrent<T>(
  supabase: SupabaseClient,
  table: "sap_plans" | "crf_forms" | "shell_tables",
  protocolId: string,
): Promise<StoredDocument<T> | null> {
  const columns =
    table === "sap_plans"
      ? "id, spec, validation, created_at"
      : "id, spec, validation, sap_id, created_at";

  const { data } = await supabase
    .from(table)
    .select(columns)
    .eq("protocol_id", protocolId)
    .eq("status", "ready")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const row = data as unknown as {
    id: string;
    spec: T | null;
    validation: { findings?: Finding[] } | null;
    sap_id?: string | null;
    created_at: string;
  } | null;

  if (!row?.spec) return null;

  return {
    id: row.id,
    spec: row.spec,
    findings: row.validation?.findings ?? [],
    sapId: row.sap_id ?? null,
    createdAt: row.created_at,
  };
}
