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

const fmtUsd = (n: number) => (n < 0.01 ? `$${n.toFixed(4)}` : `$${n.toFixed(2)}`);
const fmtTokens = (n: number) => (n < 1000 ? String(n) : `${(n / 1000).toFixed(1)}k`);

/**
 * Starts stage 0: protocol to draft specification. The draft is not final; it
 * lands on the sign-off page, which is where gate G0 is applied.
 */
export function BuildSpecButton({
  protocolId,
  reviewId,
  existingSpecId,
}: {
  protocolId: string;
  reviewId: string;
  existingSpecId?: string | null;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [meter, setMeter] = useState<{ usage: Usage; cost: number } | null>(null);
  const running = status !== null;

  if (existingSpecId && !running) {
    return (
      <a
        href={`/specs/${existingSpecId}`}
        className="rounded-lg bg-accent px-3 py-2 text-xs font-medium text-white"
      >
        Open the study specification
      </a>
    );
  }

  async function start() {
    setError(null);
    setMeter(null);
    setStatus("Starting");

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
        if (event.type === "usage") setMeter({ usage: event.usage, cost: event.cost });
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
    <div className="space-y-2">
      <button
        type="button"
        onClick={start}
        disabled={running}
        className="rounded-lg bg-accent px-3 py-2 text-xs font-medium text-white disabled:opacity-50"
      >
        {running ? "Building..." : "Build CRF, SAP and shell tables"}
      </button>

      {running && (
        <div className="rounded-lg border border-border bg-surface px-3 py-2.5">
          <p className="flex items-center gap-2 text-xs">
            <span className="inline-block size-2 animate-pulse rounded-full bg-accent" />
            {status}
          </p>
          {meter ? (
            <p className="mt-1.5 font-mono text-xs text-muted">
              {fmtTokens(meter.usage.output_tokens)} written · {fmtUsd(meter.cost)}
            </p>
          ) : (
            <p className="mt-1.5 text-xs text-muted">
              This takes a few minutes. Leave the tab open.
            </p>
          )}
        </div>
      )}

      {error && (
        <p className="rounded-lg bg-danger-soft px-3 py-2 text-xs text-danger">{error}</p>
      )}
    </div>
  );
}
