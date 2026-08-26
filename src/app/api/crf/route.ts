import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { extractProtocol } from "@/lib/protocol/extract";
import { buildCrfSpec } from "@/lib/crf/build";
import { MODEL } from "@/lib/protocol/analyze";
import { costOf, type TokenUsage } from "@/lib/protocol/pricing";
import type { SapSpec } from "@/lib/sap/types";
import { isLinkable } from "@/lib/sap/types";

export const runtime = "nodejs";
export const maxDuration = 900;

type Event =
  | { type: "status"; message: string }
  | { type: "usage"; usage: TokenUsage; cost: number }
  | { type: "done"; crfId: string; errors: number; warnings: number }
  | { type: "error"; message: string };

/**
 * Builds the case report form. The analysis plan must exist first: the form's
 * job is to collect what the plan analyses, so without one there is nothing to
 * check it against.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as {
    protocolId?: string;
    reviewId?: string;
  };
  if (!body.protocolId) {
    return NextResponse.json({ error: "protocolId is required." }, { status: 400 });
  }

  const { data: sapRow } = await supabase
    .from("sap_plans")
    .select("id, spec")
    .eq("protocol_id", body.protocolId)
    .eq("status", "ready")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!sapRow?.spec) {
    return NextResponse.json(
      {
        error:
          "Build the Statistical Analysis Plan first. The form collects what the plan analyses, so without one there is nothing to build it against.",
      },
      { status: 409 },
    );
  }

  if (!isLinkable(sapRow.spec as SapSpec)) {
    return NextResponse.json(
      { error: "The Statistical Analysis Plan for this protocol was built before the three documents were linked to each other, so its variables carry no ids to link to. Build the plan again, then build this." },
      { status: 409 },
    );
  }

  const { data: protocolRow } = await supabase
    .from("protocols")
    .select("id, filename, storage_path, mime")
    .eq("id", body.protocolId)
    .single();

  if (!protocolRow?.storage_path) {
    return NextResponse.json(
      { error: "The original file for this protocol was not stored. Upload it again." },
      { status: 409 },
    );
  }

  let answers: string | null = null;
  if (body.reviewId) {
    const { data: reviewRow } = await supabase
      .from("reviews")
      .select("answers")
      .eq("id", body.reviewId)
      .single();
    answers = reviewRow?.answers ?? null;
  }

  const download = await supabase.storage.from("protocols").download(protocolRow.storage_path);
  if (download.error || !download.data) {
    return NextResponse.json({ error: "Could not read the stored protocol file." }, { status: 409 });
  }
  const buffer = Buffer.from(await download.data.arrayBuffer());

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: Event) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));

      try {
        send({ type: "status", message: "Reading the protocol" });
        const protocol = await extractProtocol(
          buffer,
          protocolRow.filename,
          protocolRow.mime ?? undefined,
        );

        let lastAt = 0;
        const result = await buildCrfSpec(protocol, sapRow.spec as SapSpec, {
          answers,
          onProgress: (message) => send({ type: "status", message }),
          onUsage: (usage) => {
            const now = Date.now();
            if (now - lastAt < 700) return;
            lastAt = now;
            send({ type: "usage", usage, cost: costOf(MODEL, usage).total });
          },
        });

        send({
          type: "usage",
          usage: result.usage,
          cost: costOf(result.model, result.usage).total,
        });

        const { data: row, error } = await supabase
          .from("crf_forms")
          .insert({
            protocol_id: protocolRow.id,
            sap_id: sapRow.id,
            owner: user.id,
            status: "ready",
            spec: result.spec,
            validation: { findings: result.findings },
            model: result.model,
            usage: result.usage,
          })
          .select("id")
          .single();

        if (error) throw new Error(error.message);

        send({
          type: "done",
          crfId: row.id,
          errors: result.findings.filter((f) => f.severity === "ERROR").length,
          warnings: result.findings.filter((f) => f.severity === "WARN").length,
        });
      } catch (error) {
        send({
          type: "error",
          message: error instanceof Error ? error.message : "Building the form failed.",
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
