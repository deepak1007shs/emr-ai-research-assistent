"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Usage = { output_tokens: number };
type Event =
  | { type: "status"; message: string }
  | { type: "usage"; usage: Usage; cost: number }
  | { type: "done"; sapId: string }
  | { type: "error"; message: string };

const fmtUsd = (n: number) => (n < 0.01 ? `$${n.toFixed(4)}` : `$${n.toFixed(2)}`);

/**
 * Builds the Statistical Analysis Plan, then offers it as a download.
 *
 * If one already exists for this protocol it links straight to it, rather than
 * paying to build a second.
 */
export function SapButton({
  protocolId,
  reviewId,
  existingSapId,
}: {
  protocolId: string;
  reviewId: string;
  existingSapId: string | null;
}) {
  const router = useRouter();
  const [sapId, setSapId] = useState(existingSapId);
  const [status, setStatus] = useState<string | null>(null);
  const [cost, setCost] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const building = status !== null;

  async function build() {
    setError(null);
    setCost(null);
    setStatus("Starting");

    let response: Response;
    try {
      response = await fetch("/api/sap", {
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
          setSapId(event.sapId);
          setStatus(null);
          router.refresh();
          return;
        }
      }
    }
    setStatus(null);
    setError("The connection closed before the plan finished.");
  }

  return (
    <section className="no-print rounded-xl border border-border bg-surface p-5">
      <h2 className="text-base font-semibold">Statistical Analysis Plan</h2>
      <p className="mt-1 text-sm text-muted">
        Your objectives rewritten as answerable questions, and the analysis map that
        links each one to its outcome, its predictors and the table it will fill. The
        test is chosen from the data type and the comparison, so the same study always
        gives the same plan.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {sapId ? (
          <>
            <a
              href={`/api/sap/${sapId}/export`}
              className="rounded-lg bg-accent px-3 py-2 text-xs font-medium text-white"
            >
              Download SAP (.docx)
            </a>
            <button
              type="button"
              onClick={build}
              disabled={building}
              className="rounded-lg border border-border px-3 py-2 text-xs font-medium disabled:opacity-50"
            >
              {building ? "Rebuilding..." : "Rebuild with my answers"}
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={build}
            disabled={building}
            className="rounded-lg bg-accent px-3 py-2 text-xs font-medium text-white disabled:opacity-50"
          >
            {building ? "Building..." : "Build the Statistical Analysis Plan"}
          </button>
        )}
      </div>

      {building && (
        <div className="mt-3 rounded-lg border border-border px-3 py-2.5">
          <p className="flex items-center gap-2 text-xs">
            <span className="inline-block size-2 animate-pulse rounded-full bg-accent" />
            {status}
          </p>
          <p className="mt-1.5 text-xs text-muted">
            A minute or two. Leave the tab open.
            {cost !== null && <span className="font-mono"> {fmtUsd(cost)} so far.</span>}
          </p>
        </div>
      )}

      {error && (
        <p className="mt-3 rounded-lg bg-danger-soft px-3 py-2 text-xs text-danger">{error}</p>
      )}
    </section>
  );
}
