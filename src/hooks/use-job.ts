"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { JobKind, Produced, Stage } from "@/lib/jobs/plan";

/**
 * Watches a build without holding it up.
 *
 * The build used to happen inside the response stream this hook's predecessor
 * read, so closing the tab killed it. Now the build runs on the server in
 * after() and writes its progress to a row; this polls that row. Unmounting
 * stops the polling and nothing else, and a tab opened later picks the same job
 * back up, because the progress was never in the tab.
 */

export type JobView = {
  id: string;
  kind: JobKind;
  status: "running" | "done" | "failed";
  stage: Stage | null;
  step: string | null;
  produced: Produced[];
  cost: number | null;
  error: string | null;
  /** Nobody has written to this row for ten minutes: its server is gone. */
  stalled: boolean;
};

const POLL_MS = 1200;

export function useJob(protocolId: string) {
  const router = useRouter();
  const [job, setJob] = useState<JobView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  // A tab opened while a build is already running adopts it.
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/jobs?protocolId=${encodeURIComponent(protocolId)}`)
      .then((r) => r.json())
      .then((body) => {
        if (!cancelled && body.job) setJob(body.job as JobView);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [protocolId]);

  useEffect(() => {
    if (!job || job.status !== "running" || job.stalled) return;

    let cancelled = false;
    const timer = setInterval(async () => {
      const next = await fetch(`/api/jobs/${job.id}`)
        .then((r) => (r.ok ? (r.json() as Promise<JobView>) : null))
        .catch(() => null);
      if (cancelled || !next) return;

      setJob(next);
      if (next.status !== "running") {
        // The documents are server-rendered, so ask for the page again.
        router.refresh();
      }
    }, POLL_MS);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [job, router]);

  const start = useCallback(
    async (kind: JobKind) => {
      setError(null);
      setStarting(true);
      try {
        const response = await fetch("/api/build", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ protocolId, kind }),
        });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) {
          setError(body.error ?? "The build could not be started.");
          return;
        }
        setJob({
          id: body.jobId,
          kind,
          status: "running",
          stage: null,
          step: "Starting",
          produced: [],
          cost: null,
          error: null,
          stalled: false,
        });
      } catch {
        setError("Could not reach the server.");
      } finally {
        setStarting(false);
      }
    },
    [protocolId],
  );

  const reset = useCallback(() => {
    setError(null);
    setJob(null);
  }, []);

  return {
    job,
    /** True from the click until the job is done, failed or found stalled. */
    running: starting || Boolean(job && job.status === "running" && !job.stalled),
    error: error ?? (job?.status === "failed" ? job.error : null),
    stalled: Boolean(job?.stalled),
    start,
    reset,
  };
}
