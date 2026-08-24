"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Event =
  | { type: "status"; message: string }
  | { type: "done"; reviewId: string }
  | { type: "error"; message: string };

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
    setStatus("Uploading");

    const form = new FormData();
    if (file) form.set("file", file);
    else form.set("text", text);

    let response: Response;
    try {
      response = await fetch("/api/analyze", { method: "POST", body: form });
    } catch {
      setError("Could not reach the server.");
      setStatus(null);
      return;
    }

    if (!response.ok || !response.body) {
      const message = await response
        .json()
        .then((b) => b.error as string)
        .catch(() => "The upload was rejected.");
      setError(message);
      setStatus(null);
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    // Server-sent events arrive as `data: {json}\n\n`, and a chunk boundary can
    // land anywhere, so hold the tail until a blank line completes an event.
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const parts = buffer.split("\n\n");
      buffer = parts.pop() ?? "";

      for (const part of parts) {
        const line = part.split("\n").find((l) => l.startsWith("data: "));
        if (!line) continue;

        let event: Event;
        try {
          event = JSON.parse(line.slice(6));
        } catch {
          continue;
        }

        if (event.type === "status") setStatus(event.message);
        if (event.type === "error") {
          setError(event.message);
          setStatus(null);
          return;
        }
        if (event.type === "done") {
          router.push(`/reviews/${event.reviewId}`);
          router.refresh();
          return;
        }
      }
    }

    setStatus(null);
    setError("The connection closed before the review finished.");
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
        className="w-full rounded-lg bg-accent px-4 py-3 text-sm font-medium text-white disabled:opacity-50"
      >
        {running ? "Reviewing…" : "Review this protocol"}
      </button>

      {running && (
        <div className="rounded-lg border border-border bg-surface px-4 py-3">
          <p className="flex items-center gap-2 text-sm">
            <span className="inline-block size-2 animate-pulse rounded-full bg-accent" />
            {status}
          </p>
          <p className="mt-1.5 text-xs text-muted">
            A full review takes a few minutes. Leave this tab open.
          </p>
        </div>
      )}
    </form>
  );
}
