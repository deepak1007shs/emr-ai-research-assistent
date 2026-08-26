import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * Removing one document, or one superseded version of one.
 *
 * Every rebuild inserts a row and the newest ready row is the current one, so a
 * version and a document are the same thing here: deleting the newest makes the
 * one before it current again, and deleting the only one leaves nothing built.
 * That is the behaviour a version list wants, and it needs no special case.
 */

const TABLE = {
  review: "reviews",
  sap: "sap_plans",
  crf: "crf_forms",
  tables: "shell_tables",
} as const;

type Kind = keyof typeof TABLE;

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ kind: string; id: string }> },
) {
  const { kind, id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const table = TABLE[kind as Kind];
  if (!table) {
    return NextResponse.json({ error: "There is no such document." }, { status: 400 });
  }

  // Read it back first, so a missing row is a 404 rather than a silent success:
  // RLS makes someone else's document indistinguishable from a missing one, and
  // "deleted" is the wrong word for either.
  const { data: row } = await supabase.from(table).select("id").eq("id", id).maybeSingle();
  if (!row) return NextResponse.json({ error: "Document not found." }, { status: 404 });

  const { error } = await supabase.from(table).delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ deleted: true });
}
