import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { extractProtocol } from "@/lib/protocol/extract";
import { buildSapSpec } from "@/lib/sap/build";
import { checkCoverage } from "@/lib/sap/coverage";
import { MODEL } from "@/lib/protocol/analyze";
import { costOf, type TokenUsage } from "@/lib/protocol/pricing";
import { loadDecisions } from "@/lib/workspace/decisions";

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
  // Per-issue answers and the general box are folded into one block first.
  const { answers } = await loadDecisions(supabase, body.protocolId, body.reviewId);

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

        // The plan is finished; now read the protocol back against it. This is
        // the only check in the application that looks at the protocol at all,
        // so a variable the protocol describes and the plan missed is invisible
        // without it. A failure here must not lose the plan, which is why it is
        // caught: a plan with no coverage check is worth more than no plan.
        let coverage: Awaited<ReturnType<typeof checkCoverage>> | null = null;
        try {
          coverage = await checkCoverage(protocol, result.spec, {
            onProgress: (message) => send({ type: "status", message }),
            onUsage: (usage) => send({ type: "usage", usage, cost: costOf(MODEL, usage).total }),
          });
        } catch {
          send({
            type: "status",
            message: "The plan is built. The protocol could not be read back against it.",
          });
        }

        const usage = coverage
          ? {
              input_tokens: result.usage.input_tokens + coverage.usage.input_tokens,
              output_tokens: result.usage.output_tokens + coverage.usage.output_tokens,
              cache_creation_input_tokens:
                result.usage.cache_creation_input_tokens + coverage.usage.cache_creation_input_tokens,
              cache_read_input_tokens:
                result.usage.cache_read_input_tokens + coverage.usage.cache_read_input_tokens,
            }
          : result.usage;
        const findings = [...result.findings, ...(coverage?.findings ?? [])];

        send({
          type: "usage",
          usage,
          cost: costOf(result.model, usage).total,
        });

        const { data: row, error } = await supabase
          .from("sap_plans")
          .insert({
            protocol_id: protocolRow.id,
            review_id: body.reviewId ?? null,
            owner: user.id,
            status: "ready",
            spec: result.spec,
            validation: { findings },
            model: result.model,
            usage,
          })
          .select("id")
          .single();

        if (error) throw new Error(error.message);
        send({
          type: "done",
          sapId: row.id,
          errors: findings.filter((f) => f.severity === "ERROR").length,
          warnings: findings.filter((f) => f.severity === "WARN").length,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Building the plan failed.";
        // Recorded, not only sent. A failure that leaves nothing behind can only
        // be diagnosed from the runs that happened to succeed beside it.
        await supabase.from("sap_plans").insert({
          protocol_id: protocolRow.id,
          review_id: body.reviewId ?? null,
          owner: user.id,
          status: "failed",
          error: message,
        });
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
