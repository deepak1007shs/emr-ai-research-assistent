"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { useEventStream } from "@/hooks/use-event-stream";
import { DOC_LABEL, type DocKind } from "@/lib/workspace/rail";
import type { Finding } from "@/lib/sap/validate";

/**
 * Asking for a change to the document you are reading.
 *
 * It proposes; it does not apply. The change is shown, with what it would touch
 * and anything it would break, and the document only moves when you accept. A
 * document you did not agree to is worse than one you have to correct twice.
 *
 * It lives in the workspace layout, which App Router keeps across navigation,
 * so switching documents does not throw away a proposal or a running request.
 */

const fmtUsd = (n: number) => (n < 0.01 ? `$${n.toFixed(4)}` : `$${n.toFixed(2)}`);

/** Openings, because a blank box is hard to start from. */
const SUGGESTIONS = [
  "Merge duplicate tables",
  "Add a sensitivity analysis",
  "Adjust for ASA grade",
];

type Proposal = {
  revisionId: string;
  summary: string;
  changed: string[];
  needsRebuild: boolean;
  findings: Finding[];
  newErrors: number;
};

export function ChatDock({
  protocolId,
  document,
}: {
  protocolId: string;
  /** Which document is open. */
  document: DocKind;
}) {
  const router = useRouter();

  const [instruction, setInstruction] = useState("");
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [settling, setSettling] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [open, setOpen] = useState(true);

  const onEvent = useCallback(
    (event: { type: string; [key: string]: unknown }) => {
      if (event.type !== "proposal") return;
      setProposal({
        revisionId: String(event.revisionId),
        summary: String(event.summary ?? ""),
        changed: (event.changed as string[]) ?? [],
        needsRebuild: Boolean(event.needsRebuild),
        findings: (event.findings as Finding[]) ?? [],
        newErrors: Number(event.newErrors ?? 0),
      });
    },
    [],
  );

  const { status, running, cost, error, start } = useEventStream("/api/revise", onEvent, {
    closedMessage: "The connection closed before the change came back.",
  });

  const revisable = document === "sap" || document === "crf";

  function ask() {
    if (!instruction.trim()) return;
    setProposal(null);
    setNote(null);
    start({ protocolId, document, instruction });
  }

  async function settle(discard: boolean) {
    if (!proposal) return;
    setSettling(true);
    try {
      const response = await fetch(`/api/revise/${proposal.revisionId}/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ discard }),
      });
      if (!response.ok) {
        const failed = await response.json().catch(() => ({}));
        setNote(failed.error ?? "That did not work.");
        return;
      }
      setProposal(null);
      setInstruction("");
      setNote(discard ? "Discarded. The document is unchanged." : "Applied.");
      if (!discard) router.refresh();
    } finally {
      setSettling(false);
    }
  }

  if (!revisable) return null;

  return (
    <section className="shrink-0 border-t border-line bg-surface-2 px-3.5 pt-3 pb-3.5">
      <div className="mb-2 flex items-center gap-2">
        <span className="eyebrow">Ask for a change</span>
        <span className="flex-1" />
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="text-xs text-ink-3 hover:text-ink-2"
        >
          {open ? "Hide" : "Show"}
        </button>
      </div>

      {open && (
        <>
          {proposal ? (
            <ProposalCard proposal={proposal} settling={settling} onSettle={settle} />
          ) : (
            <>
              {/* A blank box is hard to start from; these fill it. */}
              <div className="mb-2 flex flex-wrap gap-1.25">
                {SUGGESTIONS.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => setInstruction(suggestion)}
                    disabled={running}
                    className="h-6 rounded-sm border border-line bg-surface px-2 text-2xs text-ink-2 transition-colors hover:border-brand-200 hover:bg-brand-50 hover:text-brand-ink"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>

              <div className="rounded-xl border border-line bg-surface px-2.5 pt-2.25 pb-2 shadow-[0_1px_2px_rgb(15_23_42_/_0.04)]">
                <textarea
                  value={instruction}
                  onChange={(e) => setInstruction(e.target.value)}
                  onKeyDown={(e) => {
                    // Enter sends; a newline still needs Shift, as in every
                    // other message box.
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      ask();
                    }
                  }}
                  rows={3}
                  disabled={running}
                  placeholder="e.g. add ASA grade as a confounder, and adjust the conversion model for it."
                  className="w-full resize-none border-0 bg-transparent p-0 text-sm leading-relaxed text-ink outline-none"
                />
                <div className="mt-1 flex items-center gap-2">
                  <span className="text-2xs text-ink-4">
                    Applies to the whole {DOC_LABEL[document].toLowerCase()}
                  </span>
                  <span className="flex-1" />
                  <button
                    type="button"
                    onClick={ask}
                    disabled={running || !instruction.trim()}
                    className={`h-7 rounded-md border px-3 text-xs font-semibold transition-colors ${
                      instruction.trim() && !running
                        ? "border-brand bg-brand text-[var(--accent-foreground)] hover:border-brand-ink hover:bg-brand-ink"
                        : "border-line bg-bg text-ink-4"
                    }`}
                  >
                    {running ? "Working..." : "Propose"}
                  </button>
                </div>
              </div>
            </>
          )}

          {running && (
            <p className="mt-2 flex items-center gap-2 text-2xs text-ink-3">
              <span className="live-dot" />
              {status}
              {cost !== null && <span className="tnum">{fmtUsd(cost)} so far.</span>}
            </p>
          )}
          {note && <p className="mt-2 text-2xs text-ink-3">{note}</p>}
          {error && (
            <p className="mt-2 rounded-lg bg-warn-50 px-2.5 py-2 text-2xs text-warn">{error}</p>
          )}
        </>
      )}
    </section>
  );
}

function ProposalCard({
  proposal,
  settling,
  onSettle,
}: {
  proposal: Proposal;
  settling: boolean;
  onSettle: (discard: boolean) => void;
}) {
  if (proposal.needsRebuild) {
    return (
      <div className="space-y-2">
        <p className="rounded-lg bg-amber-50 px-2.5 py-2 text-xs leading-relaxed text-ink">
          {proposal.summary}
        </p>
        <button
          type="button"
          onClick={() => onSettle(true)}
          disabled={settling}
          className="btn btn-quiet"
        >
          Close
        </button>
      </div>
    );
  }

  if (!proposal.changed.length) {
    return (
      <div className="space-y-2">
        <p className="text-xs leading-relaxed text-ink">{proposal.summary}</p>
        <p className="text-2xs text-ink-3">Nothing changed, so there is nothing to accept.</p>
        <button
          type="button"
          onClick={() => onSettle(true)}
          disabled={settling}
          className="btn btn-quiet"
        >
          Close
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2 rounded-xl border border-line bg-surface px-2.5 py-2.5">
      <p className="text-xs leading-relaxed text-ink">{proposal.summary}</p>

      <p className="text-2xs text-ink-3">
        <span className="font-semibold text-ink-2">Would change:</span>{" "}
        {proposal.changed.join(", ")}
      </p>

      {proposal.newErrors > 0 && (
        <div className="rounded-lg bg-warn-50 px-2.5 py-2 text-2xs text-warn">
          <p className="font-semibold">
            This would introduce {proposal.newErrors} new problem
            {proposal.newErrors === 1 ? "" : "s"}.
          </p>
          <ul className="mt-1 space-y-0.5">
            {proposal.findings
              .filter((f) => f.severity === "ERROR")
              .slice(0, 3)
              .map((f, i) => (
                <li key={i}>
                  {f.code}: {f.message}
                </li>
              ))}
          </ul>
          <p className="mt-1">
            You can still accept it. Sometimes a change is right and the next one fixes what it
            broke.
          </p>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onSettle(false)}
          disabled={settling}
          className="btn btn-primary"
        >
          {settling ? "Applying..." : "Accept"}
        </button>
        <button
          type="button"
          onClick={() => onSettle(true)}
          disabled={settling}
          className="btn btn-quiet"
        >
          Discard
        </button>
      </div>
    </div>
  );
}
