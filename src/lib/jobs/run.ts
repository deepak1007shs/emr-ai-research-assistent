import type { SupabaseClient } from "@supabase/supabase-js";
import { extractProtocol, type ExtractedProtocol } from "../protocol/extract.ts";
import { MODEL, analyzeProtocol } from "../protocol/analyze.ts";
import { buildSapSpec } from "../sap/build.ts";
import { checkCoverage } from "../sap/coverage.ts";
import { buildCrfSpec } from "../crf/build.ts";
import { buildTablesSpec } from "../tables/build.ts";
import { build as renderMarkdown } from "../render/markdown.ts";
import { costOf, type TokenUsage } from "../protocol/pricing.ts";
import { loadDecisions } from "../workspace/decisions.ts";
import { consequencesFor } from "../protocol/answers.ts";
import { isLinkable, type SapSpec } from "../sap/types.ts";
import type { Finding } from "../sap/validate.ts";
import { NEEDS, STAGE_LABEL, needsFirst, stagesOf, type JobKind, type Produced, type Stage } from "./plan.ts";

/**
 * The one place a document is built.
 *
 * It used to be four route handlers, each doing its work inside a
 * ReadableStream, which meant the build lived for exactly as long as the
 * browser tab did. Closing the tab aborted the stream, nothing on the server
 * watched for that, and the artifact row was only written at the very end -
 * after the model had been paid. A closed tab lost the document and kept the
 * bill.
 *
 * The bodies below are the route bodies, moved rather than rewritten. What is
 * new is around them: the order the stages must run in, and a row in `jobs`
 * they write their progress to instead of a connection.
 */

type Db = SupabaseClient;

const ZERO: TokenUsage = {
  input_tokens: 0,
  output_tokens: 0,
  cache_creation_input_tokens: 0,
  cache_read_input_tokens: 0,
};

const add = (a: TokenUsage, b: TokenUsage): TokenUsage => ({
  input_tokens: a.input_tokens + b.input_tokens,
  output_tokens: a.output_tokens + b.output_tokens,
  cache_creation_input_tokens: a.cache_creation_input_tokens + b.cache_creation_input_tokens,
  cache_read_input_tokens: a.cache_read_input_tokens + b.cache_read_input_tokens,
});

const counts = (findings: Finding[]) => ({
  errors: findings.filter((f) => f.severity === "ERROR").length,
  warnings: findings.filter((f) => f.severity === "WARN").length,
});

/**
 * Writes the job row as the work goes.
 *
 * Every write is a round trip, and a token meter that repainted on every delta
 * would be one per delta. The status line is written as it changes because
 * there are only a few dozen of them; the meter is held to one write every few
 * seconds, which is faster than a person reads it anyway.
 */
function progress(db: Db, jobId: string) {
  let banked = ZERO;
  let live = ZERO;
  let stage: Stage | null = null;
  let produced: Produced[] = [];
  let lastMeterAt = 0;

  const cost = () => costOf(MODEL, add(banked, live)).total;

  const write = async (patch: Record<string, unknown>) => {
    // A job whose progress cannot be written is still a job worth finishing, so
    // a failure here is swallowed. The row's updated_at is what tells the
    // client the work is alive; losing one write costs a stale status line.
    await db
      .from("jobs")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", jobId)
      .then(undefined, () => undefined);
  };

  return {
    async enter(next: Stage) {
      stage = next;
      live = ZERO;
      await write({ stage: next, step: `Starting the ${STAGE_LABEL[next]}` });
    },
    async step(message: string) {
      await write({ stage, step: message, usage: add(banked, live), cost: cost() });
    },
    meter(usage: TokenUsage) {
      live = usage;
      const now = Date.now();
      if (now - lastMeterAt < 2500) return;
      lastMeterAt = now;
      void write({ usage: add(banked, live), cost: cost() });
    },
    /** Banks a finished stage's real usage and records what it made. */
    async finished(entry: Produced, usage: TokenUsage) {
      banked = add(banked, usage);
      live = ZERO;
      produced = [...produced, entry];
      await write({ produced, usage: banked, cost: costOf(MODEL, banked).total });
    },
    async done() {
      await write({ status: "done", stage: null, step: null, usage: banked, cost: costOf(MODEL, banked).total });
    },
    async failed(message: string) {
      // The failing stage's own tokens are banked here, because a stage only
      // banks its usage when it finishes and a failed one never does. Writing
      // `banked` alone reported every failure as free: two runs of the shell
      // tables were cut off after five minutes of generation each and both are
      // recorded at zero, which is not what they cost.
      const spent = add(banked, live);
      await write({ status: "failed", step: null, error: message, usage: spent, cost: costOf(MODEL, spent).total });
    },
    produced: () => produced,
  };
}

type Reporter = ReturnType<typeof progress>;

/** The stored protocol file, read back and parsed. Every stage but one needs it. */
async function readProtocol(db: Db, protocolId: string): Promise<ExtractedProtocol> {
  const { data: row } = await db
    .from("protocols")
    .select("id, filename, storage_path, mime")
    .eq("id", protocolId)
    .single();

  if (!row?.storage_path) {
    throw new Error("The original file for this protocol was not stored. Upload it again.");
  }

  const download = await db.storage.from("protocols").download(row.storage_path);
  if (download.error || !download.data) {
    throw new Error("Could not read the stored protocol file.");
  }

  const buffer = Buffer.from(await download.data.arrayBuffer());
  return extractProtocol(buffer, row.filename, row.mime ?? undefined);
}

/** The most recent ready plan for a protocol, with the id the artifacts link to. */
async function readySap(db: Db, protocolId: string) {
  const { data } = await db
    .from("sap_plans")
    .select("id, spec")
    .eq("protocol_id", protocolId)
    .eq("status", "ready")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}

/* -------------------------------------------------------------------------- */
/* The stages                                                                 */
/* -------------------------------------------------------------------------- */

async function runReview(db: Db, userId: string, protocolId: string, report: Reporter): Promise<Produced> {
  await report.step("Reading the protocol");
  const protocol = await readProtocol(db, protocolId);

  const { data: reviewRow, error: reviewError } = await db
    .from("reviews")
    .insert({ protocol_id: protocolId, owner: userId, status: "pending" })
    .select("id")
    .single();
  if (reviewError) throw new Error(reviewError.message);

  try {
    const result = await analyzeProtocol(protocol, {
      onProgress: (message) => void report.step(message),
      onUsage: (usage) => report.meter(usage),
    });

    const { error: updateError } = await db
      .from("reviews")
      .update({
        status: "complete",
        spec: result.spec,
        markdown: renderMarkdown(result.spec),
        action_spec: result.actionSpec,
        action_markdown: renderMarkdown(result.actionSpec),
        model: result.model,
        usage: result.usage,
        completed_at: new Date().toISOString(),
      })
      .eq("id", reviewRow.id);
    if (updateError) throw new Error(updateError.message);

    // A review reports issues, not findings in this app's sense; the counts
    // stay at zero so the badge reads "no problems found" rather than inventing
    // a severity the review never assigned.
    const entry: Produced = { kind: "review", id: reviewRow.id, errors: 0, warnings: 0 };
    await report.finished(entry, result.usage);
    return entry;
  } catch (error) {
    const message = error instanceof Error ? error.message : "The review failed.";
    await db.from("reviews").update({ status: "failed", error: message }).eq("id", reviewRow.id);
    throw new Error(message);
  }
}

async function runSap(db: Db, userId: string, protocolId: string, report: Reporter): Promise<Produced> {
  await report.step("Reading the protocol");
  const protocol = await readProtocol(db, protocolId);

  // The investigator's answers to the review's issues override the protocol.
  // The review is not passed in: the latest complete one for this protocol is
  // the one that was read, and after this change there is always one.
  // The blockers nobody answered, as well as the answers somebody did write.
  // The plan gets all of them, unrouted: it is the root the form and the tables
  // are built from, so a blocker the review labelled wrongly would otherwise be
  // lost from the whole chain rather than from one document.
  const { answers, reviewId, unanswered } = await loadDecisions(db, protocolId);

  try {
    const result = await buildSapSpec(protocol, {
      answers,
      unresolved: unanswered,
      onProgress: (message) => void report.step(message),
      onUsage: (usage) => report.meter(usage),
    });

    // The plan is finished; now read the protocol back against it. This is the
    // only check in the application that looks at the protocol at all, so a
    // variable the protocol describes and the plan missed is invisible without
    // it. A failure here must not lose the plan, which is why it is caught: a
    // plan with no coverage check is worth more than no plan.
    let coverage: Awaited<ReturnType<typeof checkCoverage>> | null = null;
    try {
      coverage = await checkCoverage(protocol, result.spec, {
        onProgress: (message) => void report.step(message),
        onUsage: (usage) => report.meter(usage),
      });
    } catch {
      await report.step("The plan is built. The protocol could not be read back against it.");
    }

    const usage = coverage ? add(result.usage, coverage.usage) : result.usage;
    const findings = [...result.findings, ...(coverage?.findings ?? [])];

    const { data: row, error } = await db
      .from("sap_plans")
      .insert({
        protocol_id: protocolId,
        review_id: reviewId,
        owner: userId,
        status: "ready",
        spec: result.spec,
        validation: { findings },
        model: result.model,
        usage,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    const entry: Produced = { kind: "sap", id: row.id, ...counts(findings) };
    await report.finished(entry, usage);
    return entry;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Building the plan failed.";
    // Recorded, not only reported. A failure that leaves nothing behind can only
    // be diagnosed from the runs that happened to succeed beside it.
    await db.from("sap_plans").insert({
      protocol_id: protocolId,
      review_id: reviewId,
      owner: userId,
      status: "failed",
      error: message,
    });
    throw new Error(message);
  }
}

/** The plan a downstream stage builds against, or the reason there is none. */
async function planFor(db: Db, protocolId: string, stage: "crf" | "tables") {
  const sap = await readySap(db, protocolId);
  if (!sap?.spec) throw new Error(needsFirst(stage)!);
  if (!isLinkable(sap.spec as SapSpec)) {
    throw new Error(
      "The Statistical Analysis Plan for this protocol was built before the three documents were linked to each other, so its variables carry no ids to link to. Build the plan again, then build this.",
    );
  }
  return sap;
}

async function runCrf(db: Db, userId: string, protocolId: string, report: Reporter): Promise<Produced> {
  const sap = await planFor(db, protocolId, "crf");

  await report.step("Reading the protocol");
  const protocol = await readProtocol(db, protocolId);
  const { answers, unanswered } = await loadDecisions(db, protocolId);

  try {
    const result = await buildCrfSpec(protocol, sap.spec as SapSpec, {
      answers,
      unresolved: consequencesFor(unanswered, "crf"),
      onProgress: (message) => void report.step(message),
      onUsage: (usage) => report.meter(usage),
    });

    const { data: row, error } = await db
      .from("crf_forms")
      .insert({
        protocol_id: protocolId,
        sap_id: sap.id,
        owner: userId,
        status: "ready",
        spec: result.spec,
        validation: { findings: result.findings },
        model: result.model,
        usage: result.usage,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    const entry: Produced = { kind: "crf", id: row.id, ...counts(result.findings) };
    await report.finished(entry, result.usage);
    return entry;
  } catch (error) {
    // Recorded the way a failed plan is. Written after the plan was found, so a
    // form refused for having no plan to build against still writes nothing:
    // that is a run which never started, not a form that failed.
    const message = error instanceof Error ? error.message : "Building the form failed.";
    await db.from("crf_forms").insert({
      protocol_id: protocolId,
      sap_id: sap.id,
      owner: userId,
      status: "failed",
      error: message,
    });
    throw new Error(message);
  }
}

async function runTables(db: Db, userId: string, protocolId: string, report: Reporter): Promise<Produced> {
  const sap = await planFor(db, protocolId, "tables");

  // The form is not read. Its fields are computed from this same plan, so the
  // variables the tables report and the variables the form collects are one
  // list, and the tables no longer wait for a document that tells them nothing
  // the plan has not already said.

  // The tables report the study as decided, not as written.
  const { answers, unanswered } = await loadDecisions(db, protocolId);

  // Read at the end against the finished table list, to catch a result the
  // protocol promised that never became an objective and so never became a
  // table. A stored file that cannot be read costs that one check, not the
  // tables, so this is the one stage that does not insist on it.
  await report.step("Reading the protocol");
  const protocol = await readProtocol(db, protocolId).catch(() => null);

  try {
    const result = await buildTablesSpec(sap.spec as SapSpec, protocol, {
      answers,
      unresolved: consequencesFor(unanswered, "tables"),
      onProgress: (message) => void report.step(message),
      onUsage: (usage) => report.meter(usage),
    });

    const { data: row, error } = await db
      .from("shell_tables")
      .insert({
        protocol_id: protocolId,
        sap_id: sap.id,
        crf_id: null,
        owner: userId,
        status: "ready",
        spec: result.spec,
        validation: { findings: result.findings },
        model: result.model,
        usage: result.usage,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    const entry: Produced = { kind: "tables", id: row.id, ...counts(result.findings) };
    await report.finished(entry, result.usage);
    return entry;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Building the tables failed.";
    await db.from("shell_tables").insert({
      protocol_id: protocolId,
      sap_id: sap.id,
      crf_id: null,
      owner: userId,
      status: "failed",
      error: message,
    });
    throw new Error(message);
  }
}

const STAGE_FN: Record<Stage, (db: Db, userId: string, protocolId: string, report: Reporter) => Promise<Produced>> = {
  review: runReview,
  sap: runSap,
  crf: runCrf,
  tables: runTables,
};

/* -------------------------------------------------------------------------- */

/** True when the document a stage depends on is already built and ready. */
export async function hasPrerequisite(db: Db, protocolId: string, stage: Stage): Promise<boolean> {
  const required = NEEDS[stage];
  if (!required) return true;
  if (required === "review") {
    const { count } = await db
      .from("reviews")
      .select("id", { count: "exact", head: true })
      .eq("protocol_id", protocolId)
      .eq("status", "complete");
    return (count ?? 0) > 0;
  }
  return Boolean((await readySap(db, protocolId))?.spec);
}

/**
 * Runs a job to the end, or to the first stage that fails.
 *
 * A stage that produces a document carrying findings does not stop the chain.
 * Every plan this app has built carries findings, and a chain that stopped on
 * them would never once reach the form. A stage that produces nothing at all
 * does stop it, because everything after it would be built against nothing.
 */
export async function runJob(
  db: Db,
  job: { id: string; kind: JobKind; protocolId: string; userId: string },
): Promise<void> {
  const report = progress(db, job.id);
  const stages = stagesOf(job.kind);

  try {
    for (const stage of stages) {
      // A chain builds its own prerequisites as it goes; a single stage must
      // find them already there.
      const built = report.produced().some((p) => p.kind === NEEDS[stage]);
      if (!built && !(await hasPrerequisite(db, job.protocolId, stage))) {
        throw new Error(needsFirst(stage)!);
      }

      await report.enter(stage);
      await STAGE_FN[stage](db, job.userId, job.protocolId, report);
    }
    await report.done();
  } catch (error) {
    const message = error instanceof Error ? error.message : "The build failed.";
    // What a failed chain did finish is worth saying. Without it a run that
    // fails at its fourth stage reads exactly like one that did nothing.
    const done = report.produced().map((p) => STAGE_LABEL[p.kind]);
    await report.failed(
      done.length ? `${message} (${done.join(" and ")} finished before this.)` : message,
    );
  }
}
