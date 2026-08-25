import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { extractProtocol } from "@/lib/protocol/extract";
import { buildSapSpec } from "@/lib/sap/build";
import { MODEL } from "@/lib/protocol/analyze";
import { costOf, type TokenUsage } from "@/lib/protocol/pricing";

export const runtime = "nodejs";
export const maxDuration = 900;

type Event =
  | { type: "status"; message: string }
  | { type: "usage"; usage: TokenUsage; cost: number }
  | { type: "done"; sapId: string; errors: number; warnings: number }
  | { type: "error"; message: string };

/** Builds the analysis model for a protocol and stores it. */
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

  // The investigator's answers to the review's issues override the protocol.
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
        const result = await buildSapSpec(protocol, {
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
          .from("sap_plans")
          .insert({
            protocol_id: protocolRow.id,
            review_id: body.reviewId ?? null,
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
          sapId: row.id,
          errors: result.findings.filter((f) => f.severity === "ERROR").length,
          warnings: result.findings.filter((f) => f.severity === "WARN").length,
        });
      } catch (error) {
        send({
          type: "error",
          message: error instanceof Error ? error.message : "Building the plan failed.",
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
