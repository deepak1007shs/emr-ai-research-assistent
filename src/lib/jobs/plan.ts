/**
 * What a build job is.
 *
 * There is one kind now. This file used to hold the order four documents had to
 * be built in and what each needed before it could start; the plan, the shell
 * tables and the case record form were removed, and a chain of one needs no
 * ordering. What is left is the shape of a job row and the rule for spotting a
 * job whose server died.
 *
 * Kept apart from the runner because this is the part with a rule in it, and a
 * rule that cannot be tested without a database and an API key is a rule nobody
 * tests. Nothing here imports next/headers, Supabase or the model.
 */

/** The one document this application builds. */
export type Stage = "review";

export type JobKind = Stage;

export const STAGES: Stage[] = ["review"];

export const STAGE_LABEL: Record<Stage, string> = {
  review: "Protocol Review",
};

/** The stages a job runs. One, since the chain was removed. */
export function stagesOf(): Stage[] {
  return [...STAGES];
}

/**
 * A job whose server died.
 *
 * The work runs in after(), which lives in the process that served the request.
 * Restart the server mid-build and the row is left saying "running" for ever,
 * with nothing left anywhere to move it on. Ten minutes without a write is
 * longer than any single step takes, so a row that quiet is a row nobody is
 * writing to.
 */
export const STALL_AFTER_MS = 10 * 60 * 1000;

export function isStalled(
  job: { status: string; updated_at: string },
  now: number = Date.now(),
): boolean {
  if (job.status !== "running") return false;
  return now - new Date(job.updated_at).getTime() > STALL_AFTER_MS;
}

/** One finished document, as the job row records it. */
export type Produced = {
  kind: Stage;
  id: string;
  errors: number;
  warnings: number;
};

export type JobRow = {
  id: string;
  protocol_id: string;
  kind: JobKind;
  status: "running" | "done" | "failed";
  stage: Stage | null;
  step: string | null;
  produced: Produced[];
  cost: number | null;
  error: string | null;
  created_at: string;
  updated_at: string;
};
