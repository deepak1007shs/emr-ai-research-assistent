"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { useEventStream } from "@/hooks/use-event-stream";
import type { DocKind } from "@/lib/workspace/rail";

/**
 * Builds one document, or builds it again.
 *
 * One component for all three, because they only ever differed in the endpoint,
 * the key the done event uses, and the copy. Three copies of a stream reader
 * meant three places to fix anything wrong with it.
 */

const fmtUsd = (n: number) => (n < 0.01 ? `$${n.toFixed(4)}` : `$${n.toFixed(2)}`);

type Built = { errors: number; warnings: number };

const ENDPOINT: Record<Exclude<DocKind, "review">, string> = {
  sap: "/api/sap",
  crf: "/api/crf",
  tables: "/api/tables",
};

const VERB: Record<Exclude<DocKind, "review">, { build: string; wait: string; checked: string }> = {
  sap: {
    build: "Build the Statistical Analysis Plan",
    wait: "A minute or two. Leave the tab open.",
    checked: "The plan was checked",
  },
  crf: {
    build: "Build the Case Report Form",
    wait: "A few minutes. Leave the tab open.",
    checked: "Checked against the analysis plan",
  },
  tables: {
    build: "Build the Shell Tables",
    wait: "A minute or two. Leave the tab open.",
    checked: "The tables were checked",
  },
};

export function BuildButton({
  kind,
  protocolId,
  reviewId,
  exists,
  blockedReason,
  rebuildLabel,
}: {
  kind: Exclude<DocKind, "review">;
  protocolId: string;
  reviewId?: string | null;
  /** True when a document is already built, so the button offers a rebuild. */
  exists: boolean;
  /** Why the button cannot be pressed, e.g. the plan is not built yet. */
  blockedReason?: string | null;
  rebuildLabel?: string;
}) {
  const router = useRouter();
  const [built, setBuilt] = useState<Built | null>(null);

  const onEvent = useCallback(
    (event: { type: string; [key: string]: unknown }) => {
      if (event.type !== "done") return;
      setBuilt({
        errors: Number(event.errors ?? 0),
        warnings: Number(event.warnings ?? 0),
      });
      // The rail and the preview are server-rendered, so ask for them again.
      router.refresh();
    },
    [router],
  );

  const { status, running, cost, error, start } = useEventStream(ENDPOINT[kind], onEvent, {
    closedMessage: "The connection closed before the document finished.",
  });

  const verb = VERB[kind];
  const blocked = Boolean(blockedReason);

  function build() {
    setBuilt(null);
    // The tables are built from the stored plan, so they take no review id.
    start(kind === "tables" ? { protocolId } : { protocolId, reviewId });
  }

  return (
    <div className="no-print space-y-3">
      {blockedReason && (
        <p className="pill bg-warn-soft text-foreground">{blockedReason}</p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={build}
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
      </div>

      {running && (
        <div className="card px-3 py-2.5">
          <p className="flex items-center gap-2 text-xs">
            <span className="live-dot" />
            {status}
          </p>
          <p className="mt-1.5 text-xs text-muted">
            {verb.wait}
            {cost !== null && <span className="font-mono"> {fmtUsd(cost)} so far.</span>}
          </p>
        </div>
      )}

      {built && (
        <p className={`pill ${built.errors ? "bg-danger-soft text-danger" : "text-muted"}`}>
          {built.errors
            ? `${verb.checked} and ${built.errors} problem${built.errors === 1 ? "" : "s"} need your attention. It is still downloadable, and they are listed below.`
            : built.warnings
              ? `${verb.checked}: no errors, ${built.warnings} thing${built.warnings === 1 ? "" : "s"} worth a look.`
              : `${verb.checked}: no problems found.`}
        </p>
      )}

      {error && <p className="pill bg-danger-soft text-danger">{error}</p>}
    </div>
  );
}
