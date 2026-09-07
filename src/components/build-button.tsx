"use client";

import { useJob } from "@/hooks/use-job";
import { STAGE_LABEL, isChain, type JobKind, type Produced } from "@/lib/jobs/plan";

/**
 * Builds a document, or builds the whole chain.
 *
 * It no longer holds the build up. The work runs on the server after the
 * response has gone, so this button starts it, watches a row, and can be closed
 * at any point without stopping anything. That is why the wait line now says
 * the opposite of what it used to.
 */

const fmtUsd = (n: number) => (n < 0.01 ? `$${n.toFixed(4)}` : `$${n.toFixed(2)}`);

const VERB: Record<JobKind, { build: string; checked: string }> = {
  review: { build: "Review this protocol", checked: "The protocol was reviewed" },
  sap: {
    build: "Build the Statistical Analysis Plan",
    checked: "The plan and its shell tables were checked",
  },
  crf: { build: "Build the Case Record Form", checked: "Checked against the analysis plan" },
  all: { build: "Build everything", checked: "All four documents were built" },
  documents: { build: "Build all three documents", checked: "Built" },
};

/** "The plan was checked and 2 problems need your attention." */
function verdict(label: string, made: Produced): string {
  if (made.errors) {
    const s = made.errors === 1 ? "" : "s";
    return `${label} and ${made.errors} problem${s} need your attention. It is still downloadable, and they are listed below.`;
  }
  if (made.warnings) {
    const s = made.warnings === 1 ? "" : "s";
    return `${label}: no errors, ${made.warnings} thing${s} worth a look.`;
  }
  return `${label}: no problems found.`;
}

export function BuildButton({
  kind,
  protocolId,
  exists,
  blockedReason,
  rebuildLabel,
}: {
  kind: JobKind;
  protocolId: string;
  /** True when a document is already built, so the button offers a rebuild. */
  exists?: boolean;
  /** Why the button cannot be pressed, e.g. the review has not been run. */
  blockedReason?: string | null;
  rebuildLabel?: string;
}) {
  const { job, running, error, stalled, start, stop, stopping } = useJob(protocolId);

  const verb = VERB[kind];
  const blocked = Boolean(blockedReason);
  const finished = job?.status === "done" ? job.produced : [];
  // Every button on a protocol picks up whatever build is running for it, which
  // is not always the one this button would have started: the review page can
  // start a chain, and the plan page then shows it. So what is printed follows
  // the job, and falls back to this button only before one exists.
  const chain = isChain(job?.kind ?? kind);

  return (
    <div className="no-print space-y-3">
      {blockedReason && <p className="pill bg-warn-soft text-foreground">{blockedReason}</p>}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => start(kind)}
          disabled={running || blocked}
          className={exists ? "btn btn-quiet" : "btn btn-primary"}
        >
          {running
            ? exists
              ? "Rebuilding..."
              : "Building..."
            : exists
              ? (rebuildLabel ?? "Build it again")
              : verb.build}
        </button>

        {/* A build runs for minutes and can be pressed by accident. This aborts
            the model call in flight rather than waiting for it to finish, so
            stopping costs what has been spent and no more. */}
        {running && (
          <button type="button" onClick={() => void stop()} disabled={stopping} className="btn btn-quiet">
            {stopping ? "Stopping..." : "Stop"}
          </button>
        )}
      </div>

      {job?.status === "cancelled" && (
        <div className="card px-3 py-2.5">
          <p className="text-xs">{job.error ?? "Stopped."}</p>
        </div>
      )}

      {running && (
        <div className="card px-3 py-2.5">
          <p className="flex items-center gap-2 text-xs">
            <span className="live-dot" />
            {job?.stage && chain && (
              <span className="font-medium">{STAGE_LABEL[job.stage]}:</span>
            )}
            {job?.step ?? "Starting"}
          </p>
          <p className="mt-1.5 text-xs text-muted">
            You can close this tab. The build carries on without it, and the document is
            here when you come back.
            {job?.cost ? <span className="font-mono"> {fmtUsd(job.cost)} so far.</span> : null}
          </p>
          {/* A chain says what it has already finished, so a run that fails at
              its fourth stage is not mistaken for one that did nothing. */}
          {job && job.produced.length > 0 && (
            <p className="mt-1.5 text-xs text-muted">
              Done: {job.produced.map((p) => STAGE_LABEL[p.kind]).join(", ")}.
            </p>
          )}
        </div>
      )}

      {stalled && (
        <p className="pill bg-warn-soft text-foreground">
          This build stopped reporting. Its server was restarted while it was running.
          Press the button to start it again.
        </p>
      )}

      {finished.map((made) => (
        <p
          key={made.id}
          className={`pill ${made.errors ? "bg-danger-soft text-danger" : "text-muted"}`}
        >
          {verdict(chain ? STAGE_LABEL[made.kind] : verb.checked, made)}
        </p>
      ))}

      {error && <p className="pill bg-danger-soft text-danger">{error}</p>}
    </div>
  );
}
