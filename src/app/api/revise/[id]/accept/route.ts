import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { Finding } from "@/lib/sap/validate";

export const runtime = "nodejs";

const TABLE = {
  sap: "sap_plans",
  crf: "crf_forms",
  tables: "shell_tables",
} as const;

type Document = keyof typeof TABLE;

/**
 * Accepts a proposed change, or discards it.
 *
 * Accepting inserts a new artifact row, exactly as a rebuild does: the artifact
 * tables are insert-only and the newest ready row is the current one, so the
 * version this replaces is still there and still downloadable by its id.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as { discard?: boolean };

  const { data } = await supabase
    .from("revisions")
    .select(
      "id, protocol_id, document, from_id, based_on_sap_id, spec, validation, model, usage, status",
    )
    .eq("id", id)
    .maybeSingle();

  const revision = data as {
    id: string;
    protocol_id: string;
    document: Document;
    from_id: string | null;
    based_on_sap_id: string | null;
    spec: unknown;
    validation: { findings?: Finding[] } | null;
    model: string | null;
    usage: unknown;
    status: string;
  } | null;

  // RLS makes someone else's revision indistinguishable from a missing one.
  if (!revision) return NextResponse.json({ error: "Revision not found." }, { status: 404 });

  if (revision.status !== "proposed") {
    return NextResponse.json(
      { error: "That change has already been settled." },
      { status: 409 },
    );
  }

  if (body.discard) {
    await supabase
      .from("revisions")
      .update({ status: "discarded", settled_at: new Date().toISOString() })
      .eq("id", id);
    return NextResponse.json({ discarded: true });
  }

  if (!revision.spec) {
    return NextResponse.json({ error: "That change has nothing to apply." }, { status: 409 });
  }

  // The wording in this spec was copied from the plan that was in force when
  // the change was proposed. Recording whichever plan is current instead would
  // mark a document built against an older registry as up to date, which is
  // the one thing the sap_id is there to prevent.
  const sapId = revision.document === "sap" ? null : revision.based_on_sap_id;
  let crfId: string | null = null;
  if (revision.document === "tables") {
    const { data: form } = await supabase
      .from("crf_forms")
      .select("id")
      .eq("protocol_id", revision.protocol_id)
      .eq("status", "ready")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    crfId = form?.id ?? null;
  }

  const row: Record<string, unknown> = {
    protocol_id: revision.protocol_id,
    owner: user.id,
    status: "ready",
    spec: revision.spec,
    validation: revision.validation ?? { findings: [] },
    model: revision.model,
    usage: revision.usage,
  };
  if (revision.document !== "sap") row.sap_id = sapId;
  if (revision.document === "tables") row.crf_id = crfId;

  const { data: created, error } = await supabase
    .from(TABLE[revision.document])
    .insert(row)
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await supabase
    .from("revisions")
    .update({
      status: "accepted",
      accepted_id: created.id,
      settled_at: new Date().toISOString(),
    })
    .eq("id", id);

  return NextResponse.json({ accepted: true, id: created.id });
}
