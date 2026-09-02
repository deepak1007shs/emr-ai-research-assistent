import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  ExtractionError,
  extractPastedText,
  extractProtocol,
  type ExtractedProtocol,
} from "@/lib/protocol/extract";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * Saves an uploaded protocol. It does not review it.
 *
 * The review used to happen here, inside a response stream, which meant it
 * lived exactly as long as the upload page stayed open. It is now the first
 * stage of a job, started by /api/build against the id this returns, and the
 * upload page is free to navigate away the moment it has one.
 *
 * The file is read and parsed here rather than in the job, because a file that
 * cannot be read should be a plain 400 on the upload the user is looking at,
 * not a failure discovered a minute later in a job they have walked away from.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  let protocol: ExtractedProtocol;
  let bytes: Buffer;
  let mime: string;

  try {
    const form = await request.formData();
    const file = form.get("file");
    const pasted = form.get("text");

    if (file instanceof File && file.size > 0) {
      bytes = Buffer.from(await file.arrayBuffer());
      mime = file.type || "application/octet-stream";
      protocol = await extractProtocol(bytes, file.name, file.type);
    } else if (typeof pasted === "string" && pasted.trim()) {
      protocol = extractPastedText(pasted);
      // Stored as a file like any other. Every stage after the review reads the
      // protocol back from storage, so a pasted protocol that was never stored
      // could be reviewed and then never analysed - which is what used to
      // happen, and the refusal blamed the upload rather than explaining it.
      bytes = Buffer.from(pasted, "utf8");
      mime = "text/plain";
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

  const { data: row, error: insertError } = await supabase
    .from("protocols")
    .insert({
      owner: user.id,
      filename: protocol.filename,
      mime,
      char_count: protocol.kind === "text" ? protocol.text.length : null,
    })
    .select("id")
    .single();

  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });

  const storagePath = `${user.id}/${row.id}/${protocol.filename}`;
  const { error: uploadError } = await supabase.storage
    .from("protocols")
    .upload(storagePath, bytes, { contentType: mime, upsert: true });

  if (uploadError) {
    // Without the stored file nothing downstream can be built, so this is a
    // failure now rather than four refusals later.
    await supabase.from("protocols").delete().eq("id", row.id);
    return NextResponse.json(
      { error: `The protocol could not be stored: ${uploadError.message}` },
      { status: 500 },
    );
  }

  await supabase.from("protocols").update({ storage_path: storagePath }).eq("id", row.id);

  return NextResponse.json({ protocolId: row.id });
}
