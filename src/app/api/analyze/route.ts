import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  ExtractionError,
  extractPastedText,
  extractProtocol,
  type ExtractedProtocol,
} from "@/lib/protocol/extract";
import { analyzeProtocol } from "@/lib/protocol/analyze";
import { build } from "@/lib/render/markdown";

export const runtime = "nodejs";
// A full review at xhigh effort can run for several minutes.
export const maxDuration = 800;

type Event =
  | { type: "status"; message: string }
  | { type: "done"; reviewId: string }
  | { type: "error"; message: string };

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  // Read the upload before opening the stream, so a bad request is a plain
  // 400 rather than an error event the client has to unpack.
  let protocol: ExtractedProtocol;
  let fileBuffer: Buffer | null = null;
  let mime: string | null = null;

  try {
    const form = await request.formData();
    const file = form.get("file");
    const pasted = form.get("text");

    if (file instanceof File && file.size > 0) {
      fileBuffer = Buffer.from(await file.arrayBuffer());
      mime = file.type || null;
      protocol = await extractProtocol(fileBuffer, file.name, file.type);
    } else if (typeof pasted === "string" && pasted.trim()) {
      protocol = extractPastedText(pasted);
    } else {
      return NextResponse.json(
        { error: "Upload a protocol file or paste the text." },
        { status: 400 },
      );
    }
  } catch (error) {
    const message =
      error instanceof ExtractionError ? error.message : "That file could not be read.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: Event) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));

      let reviewId: string | null = null;

      try {
        send({ type: "status", message: "Saving the protocol" });

        const { data: protocolRow, error: protocolError } = await supabase
          .from("protocols")
          .insert({
            owner: user.id,
            filename: protocol.filename,
            mime,
            char_count: protocol.kind === "text" ? protocol.text.length : null,
          })
          .select("id")
          .single();

        if (protocolError) throw new Error(protocolError.message);

        if (fileBuffer) {
          const storagePath = `${user.id}/${protocolRow.id}/${protocol.filename}`;
          const { error: uploadError } = await supabase.storage
            .from("protocols")
            .upload(storagePath, fileBuffer, {
              contentType: mime ?? "application/octet-stream",
              upsert: true,
            });
          // A failed upload must not lose the review — the analysis does not
          // depend on the stored copy.
          if (!uploadError) {
            await supabase
              .from("protocols")
              .update({ storage_path: storagePath })
              .eq("id", protocolRow.id);
          }
        }

        const { data: reviewRow, error: reviewError } = await supabase
          .from("reviews")
          .insert({ protocol_id: protocolRow.id, owner: user.id, status: "pending" })
          .select("id")
          .single();

        if (reviewError) throw new Error(reviewError.message);
        reviewId = reviewRow.id;

        const result = await analyzeProtocol(protocol, {
          onProgress: (message) => send({ type: "status", message }),
        });

        const markdown = build(result.spec);

        const { error: updateError } = await supabase
          .from("reviews")
          .update({
            status: "complete",
            spec: result.spec,
            markdown,
            model: result.model,
            usage: result.usage,
            completed_at: new Date().toISOString(),
          })
          .eq("id", reviewId);

        if (updateError) throw new Error(updateError.message);

        send({ type: "done", reviewId: reviewId! });
      } catch (error) {
        const message = error instanceof Error ? error.message : "The review failed.";
        if (reviewId) {
          await supabase
            .from("reviews")
            .update({ status: "failed", error: message })
            .eq("id", reviewId);
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
