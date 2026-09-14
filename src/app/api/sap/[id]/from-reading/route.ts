import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { factsSchema } from "@/lib/facts/schema";
import { buildableFromReading, planColumns } from "@/lib/sap/stored";

export const runtime = "nodejs";

/**
 * Builds the plan from a reading already stored, without reading the protocol.
 *
 * For a row stopped at Gate A whose reading passes the gate as it stands now.
 * No model is called and nothing is billed: the plan is rules over the facts,
 * and the facts are the part that was paid for. The row is filled in place, so
 * the plan keeps the reading and the cost it came from.
 *
 * Synchronous, and not a job: building a plan from facts takes milliseconds.
 */
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const { data: row } = await supabase
    .from("sap_plans")
    .select("id, status, plan, facts")
    .eq("id", id)
    .maybeSingle();
  if (!row) return NextResponse.json({ error: "No such plan." }, { status: 404 });

  if (!buildableFromReading(row)) {
    return NextResponse.json(
      { error: "This reading cannot be built into a plan: it already has one, or it still fails Gate A." },
      { status: 409 },
    );
  }

  // Stored facts are parsed as they are everywhere else, so a reading stored
  // before a field existed takes that field's default rather than failing.
  const parsed = factsSchema.safeParse(row.facts);
  if (!parsed.success) {
    return NextResponse.json({ error: "The stored reading could not be read." }, { status: 422 });
  }

  const { plan, markdown, pinned } = planColumns(parsed.data);
  const { error } = await supabase
    .from("sap_plans")
    .update({ status: "ready", plan, markdown, pinned, error: null })
    .eq("id", id)
    .eq("status", "failed");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ status: "ready" });
}
