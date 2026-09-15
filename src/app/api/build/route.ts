import { after, NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { runJob } from "@/lib/jobs/run";
import { isStalled, type JobKind } from "@/lib/jobs/plan";

export const runtime = "nodejs";
/**
 * The whole chain, not one document.
 *
 * after() runs for the route's maximum duration, so this is the ceiling on a
 * run of both documents rather than on a single response. Nothing is streamed
 * back; the browser has long gone by the time the work is half done.
 */
export const maxDuration = 300;

const KINDS: JobKind[] = ["review", "sap", "both", "crf"];

/**
 * Starts a build and returns its job id.
 *
 * The work runs in after(), which outlives the response and therefore the tab.
 * The caller polls /api/jobs/[id] to watch it, and can stop watching whenever
 * it likes without stopping the build.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as {
    protocolId?: string;
    kind?: JobKind;
  };

  if (!body.protocolId) {
    return NextResponse.json({ error: "protocolId is required." }, { status: 400 });
  }
  if (!body.kind || !KINDS.includes(body.kind)) {
    return NextResponse.json({ error: "kind must be review, sap or both." }, { status: 400 });
  }

  const { data: protocol } = await supabase
    .from("protocols")
    .select("id, storage_path")
    .eq("id", body.protocolId)
    .maybeSingle();

  if (!protocol) {
    return NextResponse.json({ error: "No such protocol." }, { status: 404 });
  }
  if (!protocol.storage_path) {
    return NextResponse.json(
      { error: "The original file for this protocol was not stored. Upload it again." },
      { status: 409 },
    );
  }

  // Two builds of the same protocol at once would race each other to insert the
  // artifact, and both would be paid for. A job left running by a server that
  // died is not a reason to refuse a new one.
  const { data: open } = await supabase
    .from("jobs")
    .select("id, status, updated_at")
    .eq("protocol_id", body.protocolId)
    .eq("status", "running")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (open && !isStalled(open)) {
    return NextResponse.json({ jobId: open.id, alreadyRunning: true });
  }

  const { data: job, error } = await supabase
    .from("jobs")
    .insert({
      owner: user.id,
      protocol_id: body.protocolId,
      kind: body.kind,
      status: "running",
      step: "Starting",
    })
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  after(() =>
    runJob(supabase, {
      id: job.id,
      kind: body.kind!,
      protocolId: body.protocolId!,
      userId: user.id,
    }),
  );

  return NextResponse.json({ jobId: job.id });
}
