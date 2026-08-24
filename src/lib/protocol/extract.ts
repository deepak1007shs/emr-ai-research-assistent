import mammoth from "mammoth";

/**
 * Turns an uploaded protocol into something Claude can read.
 *
 * PDFs are passed through untouched — Claude reads them natively as document
 * blocks, which preserves tables and layout that a text extractor would flatten.
 * DOCX goes through mammoth, because this machine has neither pandoc nor
 * pdftotext.
 *
 * Nothing is ever truncated. A file too large to send raises, so the user finds
 * out, rather than losing the methods section silently.
 */

export type ExtractedProtocol =
  | { kind: "pdf"; base64: string; filename: string; bytes: number }
  | { kind: "text"; text: string; filename: string; bytes: number };

export class ExtractionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExtractionError";
  }
}

/**
 * The Messages API caps a request at 32 MB. Base64 inflates a file by 4/3, and
 * the prompt itself needs room, so the raw PDF ceiling is set below that.
 */
export const MAX_PDF_BYTES = 22 * 1024 * 1024;
export const MAX_TEXT_CHARS = 2_000_000;

const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

function extensionOf(filename: string): string {
  const dot = filename.lastIndexOf(".");
  return dot === -1 ? "" : filename.slice(dot + 1).toLowerCase();
}

export async function extractProtocol(
  buffer: Buffer,
  filename: string,
  mimeType?: string,
): Promise<ExtractedProtocol> {
  const bytes = buffer.byteLength;
  if (bytes === 0) throw new ExtractionError("That file is empty.");

  const ext = extensionOf(filename);
  const mime = mimeType ?? "";

  if (ext === "pdf" || mime === "application/pdf") {
    if (bytes > MAX_PDF_BYTES) {
      throw new ExtractionError(
        `That PDF is ${(bytes / 1024 / 1024).toFixed(1)} MB, above the ${
          MAX_PDF_BYTES / 1024 / 1024
        } MB limit for a single request. Split it, or upload just the protocol without the appendices and CVs.`,
      );
    }
    return { kind: "pdf", base64: buffer.toString("base64"), filename, bytes };
  }

  if (ext === "docx" || mime === DOCX_MIME) {
    const { value } = await mammoth.extractRawText({ buffer });
    const text = value.trim();
    if (!text) {
      throw new ExtractionError(
        "No text could be read from that .docx. If the content is scanned images, save it as a PDF and upload that instead.",
      );
    }
    return { kind: "text", text, filename, bytes };
  }

  if (ext === "doc" || mime === "application/msword") {
    throw new ExtractionError(
      "Legacy .doc files are not supported. Open it in Word and use File → Save As → .docx or .pdf, then upload that.",
    );
  }

  if (ext === "txt" || ext === "md" || mime.startsWith("text/")) {
    const text = buffer.toString("utf8").trim();
    if (!text) throw new ExtractionError("That file contains no text.");
    return { kind: "text", text, filename, bytes };
  }

  throw new ExtractionError(
    `Unsupported file type "${ext || mime || "unknown"}". Upload a PDF, a .docx, or plain text.`,
  );
}

/** Wraps pasted text in the same shape, so the analyzer has one input type. */
export function extractPastedText(text: string): ExtractedProtocol {
  const trimmed = text.trim();
  if (!trimmed) throw new ExtractionError("Paste the protocol text first.");
  if (trimmed.length > MAX_TEXT_CHARS) {
    throw new ExtractionError(
      `That is ${trimmed.length.toLocaleString()} characters, above the ${MAX_TEXT_CHARS.toLocaleString()} limit. Upload the file instead.`,
    );
  }
  return {
    kind: "text",
    text: trimmed,
    filename: "pasted-text.txt",
    bytes: Buffer.byteLength(trimmed, "utf8"),
  };
}
