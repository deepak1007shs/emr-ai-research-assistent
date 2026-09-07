import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * Asks a running build to stop.
 *
 * It sets the status and returns. It does not wait for the work to notice,
 * because the work is in another request's after() and possibly another
 * process: the row is the only thing this route and that runner can both see.
 * The runner reads it within a few seconds and aborts the model call it is
 * waiting on.
 *
 * Idempotent, and refuses anything not running. Stopping a build that has
 * already finished would rewrite a result that is correct.
 */
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const { data: job } = await supabase
    .from("jobs")
    .select("id, status")
    .eq("id", id)
    .maybeSingle();
  if (!job) return NextResponse.json({ error: "No such build." }, { status: 404 });

  // Already stopped is a success: pressing Stop twice is not an error, and the
  // second press should read the same as the first.
  if (job.status === "cancelled") return NextResponse.json({ status: "cancelled" });
  if (job.status !== "running") {
    return NextResponse.json(
      { error: `That build has already ${job.status === "done" ? "finished" : "stopped"}.` },
      { status: 409 },
    );
  }

  const { error } = await supabase
    .from("jobs")
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "running");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ status: "cancelled" });
}
