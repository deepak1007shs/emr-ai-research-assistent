"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { MAX_UPLOAD_BYTES, uploadPath } from "@/lib/protocol/upload-path";

/**
 * Uploads a protocol and starts its review.
 *
 * It used to read the review out of a response stream and hold the page here
 * until it finished. It no longer waits for anything: the upload saves the
 * file, the build starts on the server where it outlives this page, and we go
 * straight to the review, which shows the same build running. Closing the
 * browser now costs nothing.
 */
export function UploadForm() {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const running = status !== null;

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setStatus("Reading the file");

    const fail = (message: string) => {
      setError(message);
      setStatus(null);
    };

    // A file goes straight to storage, and only its path goes to the server:
    // Vercel refuses a function request over 4.5 MB, which a thesis protocol
    // with its annexures easily is. Pasted text is small and still posts.
    let request: RequestInit;
    if (file) {
      if (file.size > MAX_UPLOAD_BYTES) {
        return fail(
          `That file is ${(file.size / 1024 / 1024).toFixed(1)} MB, above the ${
            MAX_UPLOAD_BYTES / 1024 / 1024
          } MB limit. Upload just the protocol, without the CVs and scanned annexures.`,
        );
      }
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return fail("You are signed out. Sign in again and upload the file.");

      setStatus("Uploading the file");
      const path = uploadPath(user.id, crypto.randomUUID(), file.name);
      const { error: uploadError } = await supabase.storage
        .from("protocols")
        .upload(path, file, { contentType: file.type || undefined });
      if (uploadError) return fail(`The file could not be uploaded: ${uploadError.message}`);

      setStatus("Reading the file");
      request = {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storagePath: path, filename: file.name, mime: file.type }),
      };
    } else {
      const form = new FormData();
      form.set("text", text);
      request = { method: "POST", body: form };
    }

    let protocolId: string;
    try {
      const response = await fetch("/api/analyze", request);
      const body = await response.json().catch(() => ({}));
      if (!response.ok) return fail(body.error ?? "The upload was rejected.");
      protocolId = body.protocolId as string;
    } catch {
      return fail("Could not reach the server.");
    }

    setStatus("Starting the review");
    try {
      const response = await fetch("/api/build", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ protocolId, kind: "review" }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        // The protocol is saved either way, so the review page is still the
        // right place to land: it offers the review again from there.
        setError(body.error ?? "The protocol was saved but the review did not start.");
      }
    } catch {
      setError("The protocol was saved but the review did not start.");
    }

    router.push(`/protocols/${protocolId}/review`);
    router.refresh();
  }

  const canSubmit = (file !== null || text.trim().length > 0) && !running;

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div>
        <label
          htmlFor="protocol-file"
          className="flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-border bg-surface px-6 py-10 text-center transition-colors hover:border-accent"
        >
          <span className="text-sm font-medium">
            {file ? file.name : "Choose a protocol file"}
          </span>
          <span className="mt-1 text-xs text-muted">
            {file
              ? `${(file.size / 1024).toFixed(0)} KB — click to replace`
              : "PDF, .docx, .txt or .md"}
          </span>
        </label>
        <input
          id="protocol-file"
          ref={fileInput}
          type="file"
          accept=".pdf,.docx,.txt,.md,application/pdf"
          className="sr-only"
          disabled={running}
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null);
            setText("");
          }}
        />
      </div>

      <details className="rounded-xl border border-border bg-surface px-4 py-3">
        <summary className="cursor-pointer text-sm font-medium">
          Or paste the protocol text
        </summary>
        <textarea
          value={text}
          disabled={running || file !== null}
          onChange={(e) => setText(e.target.value)}
          rows={10}
          placeholder="Paste the full protocol — title, objectives, methods, sample size…"
          className="mt-3 w-full resize-y rounded-lg border border-border bg-background px-3 py-2 font-mono text-xs outline-none focus:border-accent disabled:opacity-50"
        />
        {file && (
          <p className="mt-2 text-xs text-muted">
            Clear the file above to paste text instead.
          </p>
        )}
      </details>

      {error && (
        <p className="rounded-lg bg-danger-soft px-3 py-2.5 text-sm text-danger">{error}</p>
      )}

      <button
        type="submit"
        disabled={!canSubmit}
        className="w-full rounded-lg bg-accent px-4 py-3 text-sm font-medium text-accent-foreground disabled:opacity-50"
      >
        {running ? "Uploading…" : "Review this protocol"}
      </button>

      {running && (
        <div className="rounded-lg border border-border bg-surface px-4 py-3">
          <p className="flex items-center gap-2 text-sm">
            <span className="inline-block size-2 animate-pulse rounded-full bg-accent" />
            {status}
          </p>
          <p className="mt-1.5 text-xs text-muted">
            The review itself runs on the server. You can close this tab as soon as the
            protocol opens.
          </p>
        </div>
      )}
    </form>
  );
}
