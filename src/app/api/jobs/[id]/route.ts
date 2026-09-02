import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isStalled } from "@/lib/jobs/plan";

export const runtime = "nodejs";

/**
 * What a build is doing, for a client that is watching it.
 *
 * The progress is a row rather than a connection, so this answers the same way
 * whether the tab has been open since the build started or was opened a minute
 * ago on another machine.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: job } = await supabase
    .from("jobs")
    .select("id, protocol_id, kind, status, stage, step, produced, cost, error, created_at, updated_at")
    .eq("id", id)
    .maybeSingle();

  if (!job) return NextResponse.json({ error: "No such job." }, { status: 404 });

  // after() runs in the process that served the request. Restart the server
  // mid-build and the row is left saying "running" with nothing left to move it
  // on, so a row nobody has written to for ten minutes is reported as stalled
  // rather than as work still in hand.
  return NextResponse.json({ ...job, stalled: isStalled(job) });
}
