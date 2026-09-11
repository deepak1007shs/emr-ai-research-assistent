import Anthropic from "@anthropic-ai/sdk";
import type { TokenUsage } from "../protocol/pricing.ts";

/**
 * The one place a request reaches the model, live or batched.
 *
 * Both document calls send the same shape - adaptive thinking, an effort, a
 * JSON schema and a cached system block - and both want the same thing back: a
 * finished message. What differs is only how long it takes to arrive and what
 * it costs, so that difference lives here and nowhere else. Two callers each
 * deciding for themselves would drift, and this repository has a test for that
 * failure in `sap/renderers.test.ts`.
 *
 * Batch is half price on everything, including output, which is 69% of the bill
 * on the twelve runs stored in Supabase. It is the only discount that touches
 * output at all, which is why it is worth more than caching and model choice
 * put together. What it costs the user is the live token meter - a batch does
 * not stream - and an answer in tens of minutes rather than minutes.
 */

export type Mode = "live" | "batch";

/**
 * Batched unless told otherwise.
 *
 * `BUILD_MODE=live` is the urgent lane: the same model, the same prompt and the
 * same settings, at full price, for a resident with a deadline.
 */
export function buildMode(): Mode {
  return process.env.BUILD_MODE === "live" ? "live" : "batch";
}

/** How often the batch is asked whether it has finished. */
export const POLL_MS = 10_000;

/** A batch that has not ended by now is not going to. */
export const BATCH_TIMEOUT_MS = 24 * 60 * 60 * 1000;

export type CallOptions = {
  signal?: AbortSignal;
  onProgress?: (note: string) => void;
  /** Live only: fires as tokens accumulate. A batch reports once, at the end. */
  onUsage?: (usage: TokenUsage) => void;
  mode?: Mode;
  /** What the work is called, for the progress line. */
  label?: string;
  /**
   * Called with the batch id the moment the batch exists, before any waiting.
   *
   * The caller stores it. A batch keeps running at Anthropic when the server
   * that sent it dies, and is billed when it ends; the id is the only way to
   * collect what was paid for rather than paying for it again.
   */
  onBatch?: (id: string) => void | Promise<void>;
  /** A batch sent by a build that died. Collected instead of sending a new one. */
  resumeBatchId?: string | null;
};

const ZERO: TokenUsage = {
  input_tokens: 0,
  output_tokens: 0,
  cache_creation_input_tokens: 0,
  cache_read_input_tokens: 0,
};

/**
 * What a message cost, in the terms `pricing.ts` bills.
 *
 * Records the two things a bare token count cannot say: how much of the cache
 * write was a 1-hour entry, which bills at 2x rather than 1.25x, and whether the
 * call was batched, which halves everything. Without them a batched run would
 * be reported at twice what it cost.
 */
export const usageOf = (message: Anthropic.Message, mode: Mode = "live"): TokenUsage => ({
  input_tokens: message.usage.input_tokens ?? 0,
  output_tokens: message.usage.output_tokens ?? 0,
  cache_creation_input_tokens: message.usage.cache_creation_input_tokens ?? 0,
  cache_read_input_tokens: message.usage.cache_read_input_tokens ?? 0,
  cache_creation_1h_input_tokens:
    message.usage.cache_creation?.ephemeral_1h_input_tokens ?? 0,
  ...(mode === "batch" ? { batch: true } : {}),
});

/** A finished call: the message, and what it cost to get. */
export type CallResult = { message: Anthropic.Message; usage: TokenUsage };

/** "4 minutes", for a progress line somebody is watching. */
export function waited(ms: number): string {
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return "less than a minute";
  if (minutes === 1) return "1 minute";
  if (minutes < 60) return `${minutes} minutes`;
  const hours = Math.floor(minutes / 60);
  return hours === 1 ? "1 hour" : `${hours} hours`;
}

export class ModelCallError extends Error {
  readonly cause?: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = "ModelCallError";
    this.cause = cause;
  }
}

/* ---- live -------------------------------------------------------------- */

async function live(
  client: Anthropic,
  params: Anthropic.Messages.MessageCreateParamsNonStreaming,
  options: CallOptions,
): Promise<Anthropic.Message> {
  const stream = client.messages.stream(params, { signal: options.signal });

  const running = { ...ZERO };
  let announced = false;

  stream.on("streamEvent", (event) => {
    if (!announced) {
      announced = true;
      options.onProgress?.(options.label ?? "Working");
    }
    // message_start carries the input side; message_delta carries a running
    // output count. Together they let the UI show the bill as it accrues.
    if (event.type === "message_start") {
      const usage = event.message.usage;
      running.input_tokens = usage.input_tokens ?? 0;
      running.cache_creation_input_tokens = usage.cache_creation_input_tokens ?? 0;
      running.cache_read_input_tokens = usage.cache_read_input_tokens ?? 0;
      options.onUsage?.({ ...running });
    } else if (event.type === "message_delta") {
      running.output_tokens = event.usage.output_tokens ?? running.output_tokens;
      options.onUsage?.({ ...running });
    }
  });

  return stream.finalMessage();
}

/* ---- batched ----------------------------------------------------------- */

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(new Error("aborted"));
      },
      { once: true },
    );
  });

async function batched(
  client: Anthropic,
  params: Anthropic.Messages.MessageCreateParamsNonStreaming,
  options: CallOptions,
  now: () => number,
): Promise<Anthropic.Message> {
  // An orphaned batch is picked up where it was left. If it cannot be found -
  // expired, deleted, or from another workspace - a fresh one is sent, which
  // is what would have happened anyway.
  const resumed = options.resumeBatchId
    ? await client.messages.batches
        .retrieve(options.resumeBatchId)
        .catch(() => null)
    : null;

  // Worth collecting only if it is still running, or ended with an answer. A
  // batch the user stopped is cancelled but still recorded on its row, and
  // "resuming" it would fail every rebuild after a Stop with "cancelled".
  const collectable =
    resumed &&
    (resumed.processing_status === "in_progress" ||
      (resumed.processing_status === "ended" && resumed.request_counts.succeeded > 0));

  const batch = collectable
    ? resumed
    : await client.messages.batches.create({
        requests: [{ custom_id: "document", params }],
      });

  await options.onBatch?.(batch.id);

  options.onProgress?.(
    collectable
      ? `${options.label ?? "Working"}. Collecting the batch an earlier build sent, rather than paying for a second one.`
      : `${options.label ?? "Working"}. Queued as a batch, which costs half as much and takes longer; you can close this tab.`,
  );

  const startedAt = now();
  let status = batch.processing_status;

  try {
    while (status !== "ended") {
      if (now() - startedAt > BATCH_TIMEOUT_MS) {
        throw new ModelCallError(
          "The batch did not finish within a day. Nothing is charged for a request that never ran. Start the build again, or set BUILD_MODE=live for an answer straight away.",
        );
      }
      await sleep(POLL_MS, options.signal);
      status = (await client.messages.batches.retrieve(batch.id)).processing_status;
      options.onProgress?.(
        `${options.label ?? "Working"}. Waiting on the batch, ${waited(now() - startedAt)} so far.`,
      );
    }
  } catch (error) {
    // A Stop reached us, or the wait ran out. Either way the batch must not be
    // left running: one nobody is waiting for is still paid for when it ends.
    await client.messages.batches.cancel(batch.id).catch(() => undefined);
    throw error;
  }

  const results = await client.messages.batches.results(batch.id);
  for await (const entry of results) {
    if (entry.custom_id !== "document") continue;
    const result = entry.result;

    if (result.type === "succeeded") {
      options.onUsage?.(usageOf(result.message, "batch"));
      return result.message;
    }
    if (result.type === "errored") {
      throw new ModelCallError(
        result.error.error?.message ?? "The batched request failed.",
        result.error,
      );
    }
    if (result.type === "canceled") {
      throw new ModelCallError("The batched request was cancelled.");
    }
    throw new ModelCallError(
      "The batched request expired before it was processed. Start the build again.",
    );
  }

  throw new ModelCallError("The batch finished and returned no result.");
}

/* ---- the one entry point ------------------------------------------------ */

export async function runMessage(
  client: Anthropic,
  params: Anthropic.Messages.MessageCreateParamsNonStreaming,
  options: CallOptions = {},
  now: () => number = Date.now,
): Promise<CallResult> {
  const mode = options.mode ?? buildMode();
  const message =
    mode === "batch"
      ? await batched(client, params, options, now)
      : await live(client, params, options);
  return { message, usage: usageOf(message, mode) };
}
