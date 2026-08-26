import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * Deleting several things at once.
 *
 * Clearing up is the one job nobody wants to do one dialog at a time, so the
 * rail can select a mixture of protocols and individual documents and send them
 * together. Each item is still deleted on its own terms: a protocol takes its
 * documents with it by the cascade, a document takes only itself.
 *
 * Nothing here is transactional, because Supabase's client cannot be. What it
 * does instead is report exactly what went and what did not, so a partial
 * failure is visible rather than silent.
 */

const TABLE = {
  review: "reviews",
  sap: "sap_plans",
  crf: "crf_forms",
  tables: "shell_tables",
} as const;

type Kind = keyof typeof TABLE;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The most one request may remove, so a bad click cannot empty the account. */
const LIMIT = 100;

export type DeleteRequest = {
  protocols?: string[];
  documents?: { kind: string; id: string }[];
};

export async function POST(request: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as DeleteRequest;

  const protocolIds = [...new Set((body.protocols ?? []).filter((id) => UUID.test(id)))];
  const documents = (body.documents ?? []).filter(
    (d): d is { kind: Kind; id: string } =>
      typeof d?.id === "string" && UUID.test(d.id) && d.kind in TABLE,
  );

  if (!protocolIds.length && !documents.length) {
    return NextResponse.json({ error: "Nothing was selected." }, { status: 400 });
  }
  if (protocolIds.length + documents.length > LIMIT) {
    return NextResponse.json(
      { error: `That is more than ${LIMIT} items. Delete them in smaller batches.` },
      { status: 400 },
    );
  }

  const failed: string[] = [];
  let deletedDocuments = 0;

  // Protocols first. A document selected inside a protocol that is also going
  // would otherwise be deleted twice, and the second attempt would look like a
  // failure when it is simply already gone.
  const { data: protocols } = await supabase
    .from("protocols")
    .select("id, filename, storage_path")
    .in("id", protocolIds.length ? protocolIds : ["00000000-0000-0000-0000-000000000000"]);

  const rows = (protocols ?? []) as { id: string; filename: string; storage_path: string | null }[];
  const goingWholesale = new Set(rows.map((r) => r.id));

  if (rows.length) {
    const { error } = await supabase.from("protocols").delete().in("id", [...goingWholesale]);
    if (error) {
      failed.push(`Could not delete the protocols: ${error.message}`);
    } else {
      const paths = rows.map((r) => r.storage_path).filter((p): p is string => Boolean(p));
      if (paths.length) await supabase.storage.from("protocols").remove(paths);
    }
  }

  // Anything selected that has not just gone with its protocol.
  const byKind = new Map<Kind, string[]>();
  for (const doc of documents) {
    byKind.set(doc.kind, [...(byKind.get(doc.kind) ?? []), doc.id]);
  }

  for (const [kind, ids] of byKind) {
    const { data, error } = await supabase
      .from(TABLE[kind])
      .delete()
      .in("id", ids)
      .select("id");

    if (error) failed.push(`Could not delete ${kind}: ${error.message}`);
    else deletedDocuments += data?.length ?? 0;
  }

  return NextResponse.json({
    deleted: { protocols: goingWholesale.size, documents: deletedDocuments },
    failed,
  });
}
