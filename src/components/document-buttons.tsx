"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Usage = {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens: number;
  cache_read_input_tokens: number;
};

type Event =
  | { type: "status"; message: string }
  | { type: "usage"; usage: Usage; model: string; cost: number }
  | { type: "done"; specId: string; errors: number; warnings: number }
  | { type: "error"; message: string };

const DOCUMENTS = [
  ["crf", "Case Record Form", "What the study collects, raw and rich"],
  ["sap", "Statistical Analysis Plan", "How every outcome will be analysed"],
  ["tables", "Shell Tables", "Every table the study will report, cells empty"],
] as const;

const fmtUsd = (n: number) => (n < 0.01 ? `$${n.toFixed(4)}` : `$${n.toFixed(2)}`);

/**
 * One button per document.
 *
 * All three render from a single specification, so they cannot disagree. The
 * button does whatever the state needs: build the specification if there is
 * none, go to sign-off if it is unsigned, download if it is signed. The
 * specification is built once whichever button is pressed first.
 */
export function DocumentButtons({
  protocolId,
  reviewId,
  specId,
  signed,
}: {
  protocolId: string;
  reviewId: string;
  specId: string | null;
  signed: boolean;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<string | null>(null);
  const [cost, setCost] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const building = status !== null;

  async function build(pending: string) {
    setError(null);
    setCost(null);
    setStatus(`Building the specification for the ${pending}`);

    let response: Response;
    try {
      response = await fetch("/api/specs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ protocolId, reviewId }),
      });
    } catch {
      setError("Could not reach the server.");
      setStatus(null);
      return;
    }

    if (!response.ok || !response.body) {
      const message = await response
        .json()
        .then((b) => b.error as string)
        .catch(() => "The request was rejected.");
      setError(message);
      setStatus(null);
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

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
        if (event.type === "usage") setCost(event.cost);
        if (event.type === "error") {
          setError(event.message);
          setStatus(null);
          return;
        }
        if (event.type === "done") {
          router.push(`/specs/${event.specId}`);
          router.refresh();
          return;
        }
      }
    }
    setStatus(null);
    setError("The connection closed before the specification finished.");
  }

  return (
    <section className="no-print rounded-xl border border-border bg-surface p-5">
      <h2 className="text-base font-semibold">Study documents</h2>
      <p className="mt-1 text-sm text-muted">
        {signed
          ? "All three are built from one specification, so they cannot disagree with each other."
          : specId
            ? "The specification is ready. Open any of the three below to read the decisions and sign it off; all three then become downloads."
            : "The specification is built once, whichever you press first. The other two are then free."}
      </p>

      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        {DOCUMENTS.map(([key, label, blurb]) =>
          signed && specId ? (
            <a
              key={key}
              href={`/api/specs/${specId}/export?doc=${key}`}
              className="rounded-lg border border-border p-3 transition-colors hover:border-accent"
            >
              <span className="block text-sm font-medium">{label}</span>
              <span className="mt-0.5 block text-xs text-muted">{blurb}</span>
              <span className="mt-2 block text-xs font-medium text-accent">Download .docx</span>
            </a>
          ) : (
            <button
              key={key}
              type="button"
              disabled={building}
              onClick={() => (specId ? router.push(`/specs/${specId}`) : build(label))}
              className="rounded-lg border border-border p-3 text-left transition-colors hover:border-accent disabled:opacity-50"
            >
              <span className="block text-sm font-medium">{label}</span>
              <span className="mt-0.5 block text-xs text-muted">{blurb}</span>
              <span className="mt-2 block text-xs font-medium text-accent">
                {specId ? "Read the decisions and sign off ->" : "Build the specification ->"}
              </span>
            </button>
          ),
        )}
      </div>

      {building && (
        <div className="mt-4 rounded-lg border border-border px-3 py-2.5">
          <p className="flex items-center gap-2 text-sm">
            <span className="inline-block size-2 animate-pulse rounded-full bg-accent" />
            {status}
          </p>
          <p className="mt-1.5 text-xs text-muted">
            A few minutes. Leave the tab open.
            {cost !== null && <span className="font-mono"> {fmtUsd(cost)} so far.</span>}
          </p>
        </div>
      )}

      {error && (
        <p className="mt-3 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>
      )}
    </section>
  );
}
