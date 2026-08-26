import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { loadCurrent } from "@/lib/workspace/document";
import { reviseDocument, type RevisableKind } from "@/lib/revise/build";
import { costOf, type TokenUsage } from "@/lib/protocol/pricing";
import { MODEL } from "@/lib/protocol/analyze";
import type { SapSpec } from "@/lib/sap/types";
import type { CrfSpec } from "@/lib/crf/types";
import type { ShellTablesSpec } from "@/lib/tables/types";
import type { Finding } from "@/lib/sap/validate";

export const runtime = "nodejs";
export const maxDuration = 900;

const TABLE = {
  sap: "sap_plans",
  crf: "crf_forms",
  tables: "shell_tables",
} as const;

type Event =
  | { type: "status"; message: string }
  | { type: "usage"; usage: TokenUsage; cost: number }
  | {
      type: "proposal";
      revisionId: string;
      summary: string;
      changed: string[];
      needsRebuild: boolean;
      findings: Finding[];
      newErrors: number;
    }
  | { type: "error"; message: string };

/**
 * Proposes a change to a document. It does not apply it.
 *
 * The proposal is stored, so a reload does not lose it and so there is a record
 * of what was asked for even when the answer is discarded. Applying it is a
 * separate, deliberate act: see the accept route.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as {
    protocolId?: string;
    document?: RevisableKind;
    instruction?: string;
  };

  const instruction = (body.instruction ?? "").trim();
  if (!body.protocolId || !body.document || !TABLE[body.document]) {
    return NextResponse.json({ error: "protocolId and document are required." }, { status: 400 });
  }
  if (!instruction) {
    return NextResponse.json({ error: "Say what you would like changed." }, { status: 400 });
  }

  const document = body.document;
  const protocolId = body.protocolId;

  // Which of the three it is, is decided by `document`; the splice casts on the
  // same key, so the union is honest rather than a convenient lie.
  const [current, plan] = await Promise.all([
    loadCurrent<SapSpec | CrfSpec | ShellTablesSpec>(supabase, TABLE[document], protocolId),
    loadCurrent<SapSpec>(supabase, "sap_plans", protocolId),
  ]);

  if (!current) {
    return NextResponse.json(
      { error: "There is nothing to revise yet. Build it first." },
      { status: 409 },
    );
  }
  if (!plan) {
    return NextResponse.json(
      { error: "The Statistical Analysis Plan is missing, and it is what the ids refer to." },
      { status: 409 },
    );
  }

  // What was already wrong is not held against the revision.
  const before = new Set(
    current.findings.filter((f) => f.severity === "ERROR").map((f) => `${f.code}:${f.message}`),
  );

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: Event) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));

      try {
        let lastAt = 0;
        const result = await reviseDocument(document, current.spec, instruction, plan.spec, {
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

        const status = result.needsRebuild
          ? "needs_rebuild"
          : result.spec
            ? "proposed"
            : "discarded";

        const { data: row, error } = await supabase
          .from("revisions")
          .insert({
            owner: user.id,
            protocol_id: protocolId,
            document,
            from_id: current.id,
            based_on_sap_id: plan.id,
            instruction,
            summary: result.summary,
            spec: result.spec,
            validation: { findings: result.findings },
            changed: result.changed,
            status,
            model: result.model,
            usage: result.usage,
            settled_at: status === "proposed" ? null : new Date().toISOString(),
          })
          .select("id")
          .single();

        if (error) throw new Error(error.message);

        send({
          type: "proposal",
          revisionId: row.id,
          summary: result.summary,
          changed: result.changed,
          needsRebuild: result.needsRebuild,
          findings: result.findings,
          newErrors: result.findings.filter(
            (f) => f.severity === "ERROR" && !before.has(`${f.code}:${f.message}`),
          ).length,
        });
      } catch (error) {
        send({
          type: "error",
          message: error instanceof Error ? error.message : "The revision failed.",
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
