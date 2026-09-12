/**
 * What a build job is.
 *
 * Two kinds, and an order between them. The review reads the protocol and says
 * what is wrong with it; the plan reads the same protocol and builds the
 * analysis. They are independent - a plan does not need a review to have run -
 * but a user who asks for both wants the review first, because its blockers are
 * what the investigator answers before the plan is worth freezing.
 *
 * Kept apart from the runner because this is the part with a rule in it, and a
 * rule that cannot be tested without a database and an API key is a rule nobody
 * tests. Nothing here imports next/headers, Supabase or the model.
 */

/** The documents this application builds. */
export type Stage = "review" | "sap" | "crf";

/** What was asked for: one document, or the review and the plan in order. */
export type JobKind = Stage | "both";

// Deliberately still the review and the plan. "Both" is what a user asks for
// when they upload a protocol, and the form is built afterwards from the plan,
// so widening this would change what an old request means.
export const STAGES: Stage[] = ["review", "sap"];

export const STAGE_LABEL: Record<Stage, string> = {
  review: "Protocol Review",
  sap: "Statistical Analysis Plan",
  crf: "Case Record Form",
};

/**
 * Why a document cannot be built yet, where something must come first.
 *
 * The form is built from the plan's own objects rather than from the protocol,
 * so there is nothing to build until the plan exists.
 */
export function needsFirst(kind: JobKind, has: { sap: boolean }): string | null {
  if (kind === "crf" && !has.sap) {
    return "The form is built from the analysis plan, so build the plan first.";
  }
  return null;
}

/** The stages a job runs, in the order it runs them. */
export function stagesOf(kind: JobKind): Stage[] {
  return kind === "both" ? [...STAGES] : [kind];
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
