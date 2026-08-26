"use client";

import { useRouter, useSelectedLayoutSegment } from "next/navigation";
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

type Proposal = {
  revisionId: string;
  summary: string;
  changed: string[];
  needsRebuild: boolean;
  findings: Finding[];
  newErrors: number;
  document: DocKind;
};

export function ChatDock({ protocolId }: { protocolId: string }) {
  const router = useRouter();
  const segment = useSelectedLayoutSegment();
  const document = (segment ?? "review") as DocKind;

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
        document: document,
      });
    },
    [document],
  );

  const { status, running, cost, error, start } = useEventStream("/api/revise", onEvent, {
    closedMessage: "The connection closed before the change came back.",
  });

  const revisable = document === "sap" || document === "crf" || document === "tables";

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
    <section className="no-print sticky bottom-0 border-t border-border bg-surface">
      <div className="mx-auto w-full max-w-4xl px-6 py-3">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-xs font-semibold tracking-wide text-muted uppercase">
            Ask for a change to the {DOC_LABEL[document]}
          </h2>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="text-xs text-accent underline underline-offset-2"
          >
            {open ? "Hide" : "Show"}
          </button>
        </div>

        {open && (
          <>
            {proposal ? (
              <ProposalCard proposal={proposal} settling={settling} onSettle={settle} />
            ) : (
              <div className="mt-2 flex items-end gap-2">
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
                  rows={2}
                  disabled={running}
                  placeholder="For example: add ASA grade as a confounder, and adjust the conversion model for it."
                  className="field resize-y leading-relaxed"
                />
                <button
                  type="button"
                  onClick={ask}
                  disabled={running || !instruction.trim()}
                  className="btn btn-primary"
                >
                  {running ? "Working..." : "Propose"}
                </button>
              </div>
            )}

            {running && (
              <p className="mt-2 flex items-center gap-2 text-xs text-muted">
                <span className="live-dot" />
                {status}
                {cost !== null && <span className="font-mono">{fmtUsd(cost)} so far.</span>}
              </p>
            )}

            {note && <p className="mt-2 text-xs text-muted">{note}</p>}
            {error && <p className="pill mt-2 bg-danger-soft text-danger">{error}</p>}
          </>
        )}
      </div>
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
      <div className="mt-2 space-y-2">
        <p className="pill bg-warn-soft text-foreground">{proposal.summary}</p>
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
      <div className="mt-2 space-y-2">
        <p className="text-xs leading-relaxed">{proposal.summary}</p>
        <p className="text-xs text-muted">Nothing was changed, so there is nothing to accept.</p>
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
    <div className="mt-2 space-y-2">
      <p className="text-xs leading-relaxed">{proposal.summary}</p>

      <p className="text-xs text-muted">
        <span className="font-semibold">Would change:</span> {proposal.changed.join(", ")}
      </p>

      {proposal.newErrors > 0 && (
        <div className="pill bg-danger-soft text-danger">
          <p className="font-semibold">
            This would introduce {proposal.newErrors} new problem
            {proposal.newErrors === 1 ? "" : "s"}.
          </p>
          <ul className="mt-1 space-y-0.5">
            {proposal.findings
              .filter((f) => f.severity === "ERROR")
              .slice(0, 4)
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
