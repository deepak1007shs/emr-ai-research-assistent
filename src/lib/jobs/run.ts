import type { SupabaseClient } from "@supabase/supabase-js";
import { extractProtocol, type ExtractedProtocol } from "../protocol/extract.ts";
import { MODEL, analyzeProtocol } from "../protocol/analyze.ts";
import { build as renderMarkdown } from "../render/markdown.ts";
import { extractFacts } from "../facts/extract.ts";
import { blockers, buildSap, warnings } from "../sap/build.ts";
import { gateA } from "../facts/gate.ts";
import { renderSapMarkdown } from "../sap/markdown.ts";
import { addUsage as add, costOf, type TokenUsage } from "../protocol/pricing.ts";
import { STAGE_LABEL, stagesOf, type JobKind, type Produced, type Stage } from "./plan.ts";

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
 * The body below is the route body, moved rather than rewritten. What is new
 * around it is a row in `jobs` it writes its progress to instead of to a
 * connection. It ran four stages in order once; the plan, the shell tables and
 * the case record form were removed, and one stage needs no order.
 */

type Db = SupabaseClient;

const ZERO: TokenUsage = {
  input_tokens: 0,
  output_tokens: 0,
  cache_creation_input_tokens: 0,
  cache_read_input_tokens: 0,
};



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
    /** Stopped on purpose. Not a failure, and not written as one. */
    async cancelled(message: string) {
      const spent = add(banked, live);
      await write({
        status: "cancelled",
        stage: null,
        step: null,
        error: message,
        usage: spent,
        cost: costOf(MODEL, spent).total,
      });
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

/**
 * How long an orphaned batch is worth going back for.
 *
 * A batch that has not ended in a day is expired by Anthropic, and its results
 * are kept for some time after it ends. A week is well inside that, so a
 * resumed batch is found rather than guessed at; one older than this is
 * forgotten and a fresh batch is sent.
 */
export const RESUME_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * The row a dead build left behind, with its batch still to collect.
 *
 * The runner lives inside the process that served the request. Restart the
 * server mid-build and the job is lost - that much was always true, and
 * `isStalled` exists for it. What batching changed is the cost: a live call
 * died with the process and was billed for what it had produced, but a batch
 * keeps running at Anthropic and is billed in full when it ends, with nobody
 * left to collect it. The next build would then pay for the same document a
 * second time. So the batch id is stored on the row the moment it exists, and
 * the next build of the same protocol finds it here and collects it.
 */
async function orphanOf(
  db: Db,
  table: "reviews" | "sap_plans",
  protocolId: string,
  now: number = Date.now(),
): Promise<{ id: string; batch_id: string } | null> {
  let query = db
    .from(table)
    .select("id, batch_id")
    .eq("protocol_id", protocolId)
    .not("batch_id", "is", null)
    .gte("created_at", new Date(now - RESUME_WINDOW_MS).toISOString());

  // Unfinished, in each table's own words: a review says so in its status; a
  // plan row is written before the call and filled in after it.
  query =
    table === "reviews"
      ? query.eq("status", "pending")
      : query.is("plan", null).is("error", null);

  const { data } = await query
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return (data as { id: string; batch_id: string } | null) ?? null;
}

/** Writes the batch id onto the row, so a dead build's batch can be found. */
const remember = (db: Db, table: "reviews" | "sap_plans", id: string) =>
  async (batchId: string) => {
    await db
      .from(table)
      .update({ batch_id: batchId })
      .eq("id", id)
      .then(undefined, () => undefined);
  };

/** The most recent ready plan for a protocol, with the id the artifacts link to. */
async function runReview(db: Db, userId: string, protocolId: string, report: Reporter, signal: AbortSignal): Promise<Produced> {
  await report.step("Reading the protocol");
  const protocol = await readProtocol(db, protocolId);

  // A dead build's row and batch, if there is one, before a new row of our own.
  const orphan = await orphanOf(db, "reviews", protocolId);
  let reviewRow: { id: string };
  if (orphan) {
    reviewRow = { id: orphan.id };
  } else {
    const { data, error: reviewError } = await db
      .from("reviews")
      .insert({ protocol_id: protocolId, owner: userId, status: "pending" })
      .select("id")
      .single();
    if (reviewError) throw new Error(reviewError.message);
    reviewRow = data;
  }

  try {
    const result = await analyzeProtocol(protocol, {
      signal,
      onProgress: (message) => void report.step(message),
      onUsage: (usage) => report.meter(usage),
      onBatch: remember(db, "reviews", reviewRow.id),
      resumeBatchId: orphan?.batch_id ?? null,
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
    if (signal.aborted) throw error;
    const message = error instanceof Error ? error.message : "The review failed.";
    await db.from("reviews").update({ status: "failed", error: message }).eq("id", reviewRow.id);
    throw new Error(message);
  }
}

/**
 * The Statistical Analysis Plan.
 *
 * One model call, then eight steps of rules. What is stored is the Facts Sheet
 * and what the rules made of it; a rebuild re-reads the protocol only because
 * the facts are the one thing rules cannot produce.
 *
 * The row is written whether or not the checks pass. A plan with a failing
 * check is still the most useful thing the investigator can be shown: it names
 * the object that failed and what to do about it, and hiding it behind an error
 * would leave them with a message and no document.
 */
async function runSap(
  db: Db,
  userId: string,
  protocolId: string,
  report: Reporter,
  signal: AbortSignal,
): Promise<Produced> {
  await report.step("Reading the protocol");
  const protocol = await readProtocol(db, protocolId);

  const orphan = await orphanOf(db, "sap_plans", protocolId);
  let row: { id: string };
  if (orphan) {
    row = { id: orphan.id };
  } else {
    const { data, error: insertError } = await db
      .from("sap_plans")
      .insert({ protocol_id: protocolId, owner: userId, status: "ready" })
      .select("id")
      .single();
    if (insertError) throw new Error(insertError.message);
    row = data;
  }

  try {
    const extracted = await extractFacts(protocol, {
      signal,
      onProgress: (message) => void report.step(message),
      onUsage: (usage) => report.meter(usage),
      onBatch: remember(db, "sap_plans", row.id),
      resumeBatchId: orphan?.batch_id ?? null,
    });

    // Gate A: the plan does not start until the design and the primary outcome
    // are settled. Where they are not, the Facts Sheet is kept with what it cost
    // and why it stopped, and no table is built on the gap. Keeping it is the
    // point: it was paid for, and it shows the investigator what the protocol
    // was read as saying, which is usually where the fix is.
    const stopped = gateA(extracted.facts).filter((check) => !check.pass);
    if (stopped.length) {
      const message = `Gate A stopped the plan before it was built. ${stopped
        .map((check) => check.message)
        .join(" ")}`;
      await db
        .from("sap_plans")
        .update({
          status: "failed",
          facts: extracted.facts,
          plan: null,
          model: extracted.model,
          usage: extracted.usage,
          error: message,
        })
        .eq("id", row.id);
      throw new Error(message);
    }

    await report.step("Building the objectives, the variables and the analysis map");
    const built = buildSap(extracted.facts);
    const failed = blockers(built);
    const warned = warnings(built);

    await report.step("Drawing the shell tables");
    const markdown = renderSapMarkdown(built);

    const { facts, ...plan } = built;
    void facts;

    const { error: updateError } = await db
      .from("sap_plans")
      .update({
        status: "ready",
        facts: extracted.facts,
        plan,
        markdown,
        pinned: built.pinned,
        model: extracted.model,
        usage: extracted.usage,
      })
      .eq("id", row.id);
    if (updateError) throw new Error(updateError.message);

    const entry: Produced = {
      kind: "sap",
      id: row.id,
      errors: failed.length,
      warnings: warned.length + built.todos.length,
    };
    await report.finished(entry, extracted.usage);
    return entry;
  } catch (error) {
    if (signal.aborted) throw error;
    const message = error instanceof Error ? error.message : "The plan failed.";
    await db.from("sap_plans").update({ status: "failed", error: message }).eq("id", row.id);
    throw new Error(message);
  }
}

export async function runJob(
  db: Db,
  job: { id: string; kind: JobKind; protocolId: string; userId: string },
): Promise<void> {
  const report = progress(db, job.id);
  const stages = stagesOf(job.kind);

  // Stop arrives as a different request, and possibly in a different process,
  // so the row is the only thing this runner and that request can both see. It
  // is read on a timer and the model call in flight is aborted, because a Stop
  // that waited for a five-minute call to end would not be stopping anything.
  const stopping = new AbortController();
  let asked = false;
  const watch = setInterval(() => {
    void db
      .from("jobs")
      .select("status")
      .eq("id", job.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.status !== "cancelled" || asked) return;
        asked = true;
        stopping.abort();
      }, () => undefined);
  }, 3000);

  try {
    for (const stage of stages) {
      // A cancel that lands between two stages stops here rather than waiting
      // for the next poll, and before any of the next stage is paid for.
      if (stopping.signal.aborted || (await isCancelled(db, job.id))) {
        asked = true;
        stopping.abort();
        break;
      }

      await report.enter(stage);
      if (stage === "review") {
        await runReview(db, job.userId, job.protocolId, report, stopping.signal);
      } else {
        await runSap(db, job.userId, job.protocolId, report, stopping.signal);
      }
    }
    if (asked) await report.cancelled(stoppedNote(report.produced()));
    else await report.done();
  } catch (error) {
    // What finished is worth saying either way. Without it a run that ends at
    // its fourth stage reads exactly like one that did nothing.
    const done = report.produced().map((p) => STAGE_LABEL[p.kind]);
    if (asked || stopping.signal.aborted) {
      await report.cancelled(stoppedNote(report.produced()));
    } else {
      const message = error instanceof Error ? error.message : "The build failed.";
      await report.failed(
        done.length ? `${message} (${done.join(" and ")} finished before this.)` : message,
      );
    }
  } finally {
    clearInterval(watch);
  }
}

/** Whether somebody has asked this build to stop. */
async function isCancelled(db: Db, jobId: string): Promise<boolean> {
  const { data } = await db.from("jobs").select("status").eq("id", jobId).maybeSingle();
  return data?.status === "cancelled";
}

/** "Stopped. The Protocol Review finished before you stopped it." */
function stoppedNote(produced: Produced[]): string {
  const done = produced.map((p) => STAGE_LABEL[p.kind]);
  if (!done.length) return "Stopped before anything was built.";
  return `Stopped. ${done.join(" and ")} finished before you stopped it, and ${
    done.length === 1 ? "it is" : "they are"
  } kept.`;
}
