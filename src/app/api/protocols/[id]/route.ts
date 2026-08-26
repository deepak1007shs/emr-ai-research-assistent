import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * Renaming and removing a protocol.
 *
 * The name is what the rail shows and what every download is called, so
 * renaming is not cosmetic: it is how a protocol stops being
 * "MD2025 final FINAL after IEC.docx" and starts being findable.
 *
 * Removing takes the review, the plan, the form and the tables with it, by the
 * cascade the schema already declares, and the uploaded file with it too. There
 * is no undo, so the caller confirms first.
 */

/** A filename that is safe to show and to put in a Content-Disposition header. */
function cleanName(raw: string): string | null {
  const name = raw.trim().replace(/[\r\n\t]/g, " ").replace(/\s{2,}/g, " ");
  if (!name || name.length > 200) return null;
  return name;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as { filename?: string };
  const filename = cleanName(body.filename ?? "");
  if (!filename) {
    return NextResponse.json(
      { error: "Give it a name, of 200 characters or fewer." },
      { status: 400 },
    );
  }

  const { data, error } = await supabase
    .from("protocols")
    .update({ filename })
    .eq("id", id)
    .select("id, filename")
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  // RLS makes someone else's protocol indistinguishable from a missing one.
  if (!data) return NextResponse.json({ error: "Protocol not found." }, { status: 404 });

  return NextResponse.json({ renamed: true, filename: data.filename });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const { data: protocol } = await supabase
    .from("protocols")
    .select("id, storage_path")
    .eq("id", id)
    .maybeSingle();

  if (!protocol) return NextResponse.json({ error: "Protocol not found." }, { status: 404 });

  // The row first: if the file removal fails the protocol is still gone, which
  // is what was asked for. An orphaned object is tidier than a half-deletion
  // that leaves the protocol visible.
  const { error } = await supabase.from("protocols").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (protocol.storage_path) {
    await supabase.storage.from("protocols").remove([protocol.storage_path]);
  }

  return NextResponse.json({ deleted: true });
}
