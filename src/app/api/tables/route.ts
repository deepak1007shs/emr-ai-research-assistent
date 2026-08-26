import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildTablesSpec } from "@/lib/tables/build";
import { MODEL } from "@/lib/protocol/analyze";
import { costOf, type TokenUsage } from "@/lib/protocol/pricing";
import type { SapSpec } from "@/lib/sap/types";
import { isLinkable } from "@/lib/sap/types";
import type { CrfSpec } from "@/lib/crf/types";

export const runtime = "nodejs";
export const maxDuration = 900;

type Event =
  | { type: "status"; message: string }
  | { type: "usage"; usage: TokenUsage; cost: number }
  | { type: "done"; tablesId: string; errors: number; warnings: number }
  | { type: "error"; message: string };

/**
 * Lays out the shell tables. The analysis plan must exist first: the tables
 * report what it analyses, so without one there is nothing to lay out.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as { protocolId?: string };
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
          "Build the Statistical Analysis Plan first. The tables report what the plan analyses, so without one there is nothing to lay out.",
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

  // The form is optional: without it the baseline table is written from the plan
  // alone, which is thinner but not wrong.
  const { data: crfRow } = await supabase
    .from("crf_forms")
    .select("spec")
    .eq("protocol_id", body.protocolId)
    .eq("status", "ready")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: Event) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));

      try {
        let lastAt = 0;
        const result = await buildTablesSpec(
          sapRow.spec as SapSpec,
          (crfRow?.spec as CrfSpec | undefined) ?? null,
          {
            onProgress: (message) => send({ type: "status", message }),
            onUsage: (usage) => {
              const now = Date.now();
              if (now - lastAt < 700) return;
              lastAt = now;
              send({ type: "usage", usage, cost: costOf(MODEL, usage).total });
            },
          },
        );

        send({
          type: "usage",
          usage: result.usage,
          cost: costOf(result.model, result.usage).total,
        });

        const { data: row, error } = await supabase
          .from("shell_tables")
          .insert({
            protocol_id: body.protocolId,
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
          tablesId: row.id,
          errors: result.findings.filter((f) => f.severity === "ERROR").length,
          warnings: result.findings.filter((f) => f.severity === "WARN").length,
        });
      } catch (error) {
        send({
          type: "error",
          message: error instanceof Error ? error.message : "Laying out the tables failed.",
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
