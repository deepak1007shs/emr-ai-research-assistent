import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isStalled } from "@/lib/jobs/plan";

export const runtime = "nodejs";

/**
 * The build in hand for a protocol, if there is one.
 *
 * A tab that was closed and reopened has no idea a build is running. It asks
 * here once, and picks the job back up where it left off. This is the whole
 * reason the progress lives in a row.
 */
export async function GET(request: NextRequest) {
  const protocolId = request.nextUrl.searchParams.get("protocolId");
  if (!protocolId) {
    return NextResponse.json({ error: "protocolId is required." }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: job } = await supabase
    .from("jobs")
    .select("id, protocol_id, kind, status, stage, step, produced, cost, error, created_at, updated_at")
    .eq("protocol_id", protocolId)
    .eq("status", "running")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!job || isStalled(job)) return NextResponse.json({ job: null });
  return NextResponse.json({ job: { ...job, stalled: false } });
}
