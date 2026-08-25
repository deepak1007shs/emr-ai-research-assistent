"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Usage = { output_tokens: number };
type Event =
  | { type: "status"; message: string }
  | { type: "usage"; usage: Usage; cost: number }
  | { type: "done"; tablesId: string; errors: number; warnings: number }
  | { type: "error"; message: string };

const fmtUsd = (n: number) => (n < 0.01 ? `$${n.toFixed(4)}` : `$${n.toFixed(2)}`);

/**
 * Builds the case report form, then offers it as a download.
 *
 * The analysis plan has to exist first: the form's job is to collect what the
 * plan analyses, so the button says so rather than failing at the server.
 */
export function TablesButton({
  protocolId,
  existingTablesId,
  hasSap,
}: {
  protocolId: string;
  existingTablesId: string | null;
  hasSap: boolean;
}) {
  const router = useRouter();
  const [tablesId, setCrfId] = useState(existingTablesId);
  const [status, setStatus] = useState<string | null>(null);
  const [cost, setCost] = useState<number | null>(null);
  const [checked, setChecked] = useState<{ errors: number; warnings: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const building = status !== null;

  async function build() {
    setError(null);
    setCost(null);
    setChecked(null);
    setStatus("Starting");

    let response: Response;
    try {
      response = await fetch("/api/tables", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ protocolId }),
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
          setCrfId(event.tablesId);
          setChecked({ errors: event.errors, warnings: event.warnings });
          setStatus(null);
          router.refresh();
          return;
        }
      }
    }
    setStatus(null);
    setError("The connection closed before the tables finished.");
  }

  return (
    <section className="no-print rounded-xl border border-border bg-surface p-5">
      <h2 className="text-base font-semibold">Shell Tables</h2>
      <p className="mt-1 text-sm text-muted">
        Every table the study will report, with the cells empty: baseline and
        descriptive first, then the primary outcome, then the secondary outcomes, then
        anything exploratory. Where an analysis is adjusted, the unadjusted and adjusted
        effect sizes sit side by side with their confidence intervals.
      </p>

      {!hasSap && (
        <p className="mt-3 rounded-lg bg-warn-soft px-3 py-2 text-xs">
          Build the Statistical Analysis Plan first. The tables report what the plan
          analyses, so without one there is nothing to lay out.
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {tablesId ? (
          <>
            <a
              href={`/api/tables/${tablesId}/export`}
              className="rounded-lg bg-accent px-3 py-2 text-xs font-medium text-white"
            >
              Download Shell Tables (.docx)
            </a>
            <button
              type="button"
              onClick={build}
              disabled={building || !hasSap}
              className="rounded-lg border border-border px-3 py-2 text-xs font-medium disabled:opacity-50"
            >
              {building ? "Rebuilding..." : "Rebuild"}
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={build}
            disabled={building || !hasSap}
            className="rounded-lg bg-accent px-3 py-2 text-xs font-medium text-white disabled:opacity-50"
          >
            {building ? "Building..." : "Build the Shell Tables"}
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
            A few minutes. Leave the tab open.
            {cost !== null && <span className="font-mono"> {fmtUsd(cost)} so far.</span>}
          </p>
        </div>
      )}

      {checked && (
        <p
          className={`mt-3 rounded-lg px-3 py-2 text-xs ${
            checked.errors ? "bg-danger-soft text-danger" : "bg-surface text-muted"
          }`}
        >
          {checked.errors
            ? `Checked against the analysis plan: ${checked.errors} problem(s) need your attention.`
            : checked.warnings
              ? `Checked against the analysis plan: no errors, ${checked.warnings} thing(s) worth a look.`
              : "Checked against the analysis plan: every analysis has a table."}
        </p>
      )}

      {error && (
        <p className="mt-3 rounded-lg bg-danger-soft px-3 py-2 text-xs text-danger">{error}</p>
      )}
    </section>
  );
}
