import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  ExtractionError,
  extractPastedText,
  extractProtocol,
  type ExtractedProtocol,
} from "@/lib/protocol/extract";
import { ownsPath } from "@/lib/protocol/upload-path";

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

  // A file the browser has already put in storage. Only its path comes here,
  // because a Vercel function will not accept a body over 4.5 MB.
  if (request.headers.get("content-type")?.includes("application/json")) {
    return saveUploaded(supabase, user.id, await request.json().catch(() => null));
  }

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

type Supabase = Awaited<ReturnType<typeof createClient>>;

/**
 * Records a protocol the browser uploaded itself.
 *
 * The file is read back and parsed here for the same reason as before: an
 * unreadable file should be a plain 400 on the page the user is looking at.
 * A file refused here is removed again, so the bucket keeps only protocols.
 */
async function saveUploaded(supabase: Supabase, userId: string, body: unknown) {
  const { storagePath, filename, mime } = (body ?? {}) as Record<string, unknown>;
  if (!ownsPath(userId, storagePath) || typeof filename !== "string" || !filename) {
    return NextResponse.json({ error: "That upload could not be found." }, { status: 400 });
  }
  const type = typeof mime === "string" && mime ? mime : "application/octet-stream";

  const download = await supabase.storage.from("protocols").download(storagePath);
  if (download.error || !download.data) {
    return NextResponse.json({ error: "That upload could not be found." }, { status: 400 });
  }

  let protocol: ExtractedProtocol;
  try {
    const bytes = Buffer.from(await download.data.arrayBuffer());
    protocol = await extractProtocol(bytes, filename, type);
  } catch (error) {
    await supabase.storage.from("protocols").remove([storagePath]);
    const message =
      error instanceof ExtractionError ? error.message : "That file could not be read.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const { data: row, error: insertError } = await supabase
    .from("protocols")
    .insert({
      owner: userId,
      filename: protocol.filename,
      mime: type,
      char_count: protocol.kind === "text" ? protocol.text.length : null,
      storage_path: storagePath,
    })
    .select("id")
    .single();

  if (insertError) {
    await supabase.storage.from("protocols").remove([storagePath]);
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({ protocolId: row.id });
}
