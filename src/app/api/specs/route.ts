import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { extractProtocol } from "@/lib/protocol/extract";
import { draftStudySpec } from "@/lib/study-spec/ingest";
import { MODEL } from "@/lib/protocol/analyze";
import { costOf, type TokenUsage } from "@/lib/protocol/pricing";

export const runtime = "nodejs";
// Drafting a whole specification is a longer job than a review.
export const maxDuration = 900;

type Event =
  | { type: "status"; message: string }
  | { type: "usage"; usage: TokenUsage; model: string; cost: number }
  | { type: "done"; specId: string; errors: number; warnings: number }
  | { type: "error"; message: string };

/**
 * Builds a draft study specification from a protocol already stored for this
 * user. The draft is saved with status `draft`: gate G0 means nothing renders
 * until the investigator signs it off.
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

  // The investigator's answers to the review's issues travel with the request:
  // they are what turns "the protocol is ambiguous" into a decided study.
  let answers: string | null = null;
  if (body.reviewId) {
    const { data: reviewRow } = await supabase
      .from("reviews")
      .select("answers")
      .eq("id", body.reviewId)
      .single();
    answers = reviewRow?.answers ?? null;
  }

  const { data: protocolRow } = await supabase
    .from("protocols")
    .select("id, filename, storage_path, mime")
    .eq("id", body.protocolId)
    .single();

  if (!protocolRow) {
    return NextResponse.json({ error: "Protocol not found." }, { status: 404 });
  }
  if (!protocolRow.storage_path) {
    return NextResponse.json(
      { error: "The original file for this protocol was not stored, so a specification cannot be built from it. Upload the protocol again." },
      { status: 409 },
    );
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

      let specId: string | null = null;

      try {
        send({ type: "status", message: "Reading the protocol" });
        const protocol = await extractProtocol(
          buffer,
          protocolRow.filename,
          protocolRow.mime ?? undefined,
        );

        const { data: row, error: insertError } = await supabase
          .from("study_specs")
          .insert({
            protocol_id: protocolRow.id,
            review_id: body.reviewId ?? null,
            owner: user.id,
            status: "draft",
          })
          .select("id")
          .single();
        if (insertError) throw new Error(insertError.message);
        specId = row.id;

        let lastUsageAt = 0;
        const result = await draftStudySpec(protocol, {
          answers,
          onProgress: (message) => send({ type: "status", message }),
          onUsage: (usage) => {
            const now = Date.now();
            if (now - lastUsageAt < 700) return;
            lastUsageAt = now;
            send({ type: "usage", usage, model: MODEL, cost: costOf(MODEL, usage).total });
          },
        });

        send({
          type: "usage",
          usage: result.usage,
          model: result.model,
          cost: costOf(result.model, result.usage).total,
        });

        const errors = result.findings.filter((f) => f.severity === "ERROR");
        const warnings = result.findings.filter((f) => f.severity === "WARN");

        const { error: updateError } = await supabase
          .from("study_specs")
          .update({
            spec: result.spec,
            spec_version: result.spec.spec_version,
            validation: { findings: result.findings, repaired: result.repaired },
            model: result.model,
            usage: result.usage,
            // A spec that fails the gate is still saved, so the findings can be
            // read and acted on. It simply cannot be signed.
            status: "draft",
          })
          .eq("id", specId);
        if (updateError) throw new Error(updateError.message);

        send({ type: "done", specId: specId!, errors: errors.length, warnings: warnings.length });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Drafting failed.";
        if (specId) {
          await supabase
            .from("study_specs")
            .update({ status: "failed", error: message })
            .eq("id", specId);
        }
        send({ type: "error", message });
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
