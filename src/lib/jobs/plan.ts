/**
 * What a build job is, and the order its stages must run in.
 *
 * Kept apart from the runner because this is the part with a rule in it, and a
 * rule that cannot be tested without a database and an API key is a rule nobody
 * tests. Nothing here imports next/headers, Supabase or the model.
 */

/** The four documents, in the order each depends on the one before. */
export type Stage = "review" | "sap" | "crf" | "tables";

/**
 * What was asked for: one document, or a chain of them.
 *
 * `all` starts at the review, for a protocol that has none. `documents` starts
 * at the plan, which is what the review page offers once its issues have been
 * answered: re-running the review there would throw away the answers, because
 * an answer belongs to the review it was written against.
 */
export type JobKind = Exclude<Stage, "tables"> | "all" | "documents";

// The tables come with the plan and before the form. They are Section 6 of the
// plan, they are built from it alone, and putting them after the form would
// mean a form that failed cost the plan its tables.
export const STAGES: Stage[] = ["review", "sap", "tables", "crf"];

/**
 * What must already exist before a stage may run.
 *
 * The plan reads the review's decisions, the form collects what the plan
 * analyses, and the tables report what the plan analyses. Building any of them
 * without the one before it means building it against nothing. Only the last
 * two were ever checked; the first held by habit, because the review happened
 * at upload and there was no other way in. A chain that can be started from
 * anywhere needs it written down.
 */
export const NEEDS: Record<Stage, Stage | null> = {
  review: null,
  sap: "review",
  crf: "sap",
  tables: "sap",
};

export const STAGE_LABEL: Record<Stage, string> = {
  review: "Protocol Review",
  sap: "Statistical Analysis Plan",
  crf: "Case Record Form",
  // Named for where it prints, because that is the only place it appears.
  tables: "Shell Tables (Section 6 of the plan)",
};

/** Why a stage cannot start, in the words the button prints. */
export function needsFirst(stage: Stage): string | null {
  const required = NEEDS[stage];
  if (!required) return null;
  return `Build the ${STAGE_LABEL[required]} first. ${WHY[stage]}`;
}

const WHY: Record<Stage, string> = {
  review: "",
  sap: "The plan is written against the review's findings and your answers to them.",
  crf: "The form collects what the plan analyses, so without one there is nothing to build it against.",
  tables: "The tables report what the plan analyses, so without one there is nothing to lay out.",
};

/**
 * The stages a job runs, in order.
 *
 * The shell tables are not one of the things you can ask for. They are Section
 * 6 of the analysis plan, so building the plan builds them, and there is no way
 * to rebuild one without the other - which is what used to let a plan and its
 * tables drift and needed a staleness warning to describe.
 *
 * The case record form goes with them for the same reason. It collects exactly
 * what the tables report, and the check that proves it can only run when both
 * exist; a plan built without its form leaves that check unrun.
 *
 * They run with the plan and before the form. The form's fields are computed
 * from the same registry the tables report, so there is nothing in the form the
 * tables need, and a form that fails must not cost the plan its Section 6.
 */
export function stagesOf(kind: JobKind): Stage[] {
  if (kind === "all") return [...STAGES];
  if (kind === "documents") return ["sap", "tables", "crf"];
  // The plan and the form are two deliverables from one backbone. Both are
  // built from the same variable list, and the form is checked against the
  // tables before either is delivered, so asking for one and not the other
  // produces a pair nothing has ever compared.
  if (kind === "sap") return ["sap", "tables", "crf"];
  return [kind];
}

/** True where a job builds more than one document. */
export function isChain(kind: JobKind): boolean {
  return stagesOf(kind).length > 1;
}

/**
 * A job whose server died.
 *
 * The work runs in after(), which lives in the process that served the request.
 * Restart the server mid-build and the row is left saying "running" for ever,
 * with nothing left anywhere to move it on. Ten minutes without a write is
 * longer than any single step of any stage takes, so a row that quiet is a row
 * nobody is writing to.
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
