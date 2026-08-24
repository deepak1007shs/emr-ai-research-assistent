import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * Gate G0: the investigator signs the specification off.
 *
 * A specification carrying gate errors cannot be signed. This is the one place
 * a human judgement is required, because the gate proves the four documents
 * agree with each other, not that the study is right.
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

  const { data, error } = await supabase
    .from("study_specs")
    .select("id, status, spec, validation")
    .eq("id", id)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Specification not found." }, { status: 404 });
  }
  if (!data.spec) {
    return NextResponse.json({ error: "That specification is still being drafted." }, { status: 409 });
  }

  const findings = (data.validation as { findings?: { severity: string }[] } | null)?.findings ?? [];
  const errors = findings.filter((f) => f.severity === "ERROR").length;
  if (errors > 0) {
    return NextResponse.json(
      { error: `This specification has ${errors} error(s) that must be fixed before it can be signed.` },
      { status: 409 },
    );
  }

  const { error: updateError } = await supabase
    .from("study_specs")
    .update({ status: "signed", signed_at: new Date().toISOString() })
    .eq("id", id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.redirect(new URL(`/specs/${id}`, request.url), { status: 303 });
}
