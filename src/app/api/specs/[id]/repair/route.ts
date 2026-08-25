import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { gateSpec } from "@/lib/study-spec/gate";
import { deterministicRepairs, stagesNeeded } from "@/lib/study-spec/repair";
import type { StudySpec } from "@/lib/study-spec/types";

export const runtime = "nodejs";

/**
 * Repairs an existing specification as cheaply as possible.
 *
 * Mechanical findings are fixed in code and cost nothing. Only if errors survive
 * that is the model involved, and then only for the stage that owns them, rather
 * than rebuilding a specification that is mostly already correct.
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
    .select("id, spec, status")
    .eq("id", id)
    .single();

  if (error || !data?.spec) {
    return NextResponse.json({ error: "Specification not found." }, { status: 404 });
  }
  if (data.status === "locked") {
    return NextResponse.json({ error: "This specification is locked." }, { status: 409 });
  }

  const before = gateSpec(data.spec);
  const { spec, applied } = deterministicRepairs(data.spec as StudySpec);
  const after = gateSpec(spec);

  if (applied.length) {
    const { error: updateError } = await supabase
      .from("study_specs")
      .update({
        spec,
        validation: { findings: after.findings, repairedInPlace: applied },
      })
      .eq("id", id);
    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }
  }

  const remaining = stagesNeeded(after.findings);

  return NextResponse.json({
    applied,
    errorsBefore: before.errors.length,
    errorsAfter: after.errors.length,
    warnings: after.warnings.length,
    // What a paid re-draft would have to touch, if anything survived.
    stagesStillNeeded: remaining,
    message: after.errors.length
      ? `${after.errors.length} error(s) remain and need judgement, in: ${remaining.join(", ")}.`
      : applied.length
        ? "Fixed without needing the model. The specification now passes."
        : "Nothing needed fixing.",
  });
}
