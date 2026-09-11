import { describe, expect, it, vi } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import {
  BATCH_TIMEOUT_MS,
  ModelCallError,
  buildMode,
  runMessage,
  waited,
} from "./call.ts";

/**
 * The batched path, driven by a fake client.
 *
 * The account has no credit, so none of this can be tried against the API. That
 * is the reason to test it here rather than to trust it: a batch that is never
 * cancelled when the user presses Stop is paid for when it ends, and nothing on
 * the page would show that it happened.
 */

const params = {
  model: "claude-opus-5",
  max_tokens: 64000,
  messages: [{ role: "user" as const, content: "go" }],
};

const message = {
  id: "msg",
  model: "claude-opus-5",
  content: [{ type: "text", text: "{}" }],
  stop_reason: "end_turn",
  usage: {
    input_tokens: 40000,
    output_tokens: 30000,
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: 27000,
  },
} as unknown as Anthropic.Message;

type Result =
  | { type: "succeeded"; message: Anthropic.Message }
  | { type: "errored"; error: { error: { message: string } } }
  | { type: "canceled" }
  | { type: "expired" };

/** A client whose batch ends after `polls` checks, with `result`. */
function fakeClient(
  result: Result,
  polls = 2,
  earlier: Record<string, { status: string; succeeded: number }> = {},
) {
  let checks = 0;
  const batches = {
    create: vi.fn(async () => ({ id: "batch_1", processing_status: "in_progress" })),
    retrieve: vi.fn(async (id: string) => {
      const old = earlier[id];
      if (old) {
        return {
          id,
          processing_status: old.status,
          request_counts: { succeeded: old.succeeded },
        };
      }
      if (id !== "batch_1") throw new Error("not found");
      checks += 1;
      return {
        id: "batch_1",
        processing_status: checks >= polls ? "ended" : "in_progress",
        request_counts: { succeeded: checks >= polls ? 1 : 0 },
      };
    }),
    cancel: vi.fn(async () => ({ id: "batch_1", processing_status: "canceling" })),
    results: vi.fn(async () =>
      (async function* () {
        yield { custom_id: "document", result };
      })(),
    ),
  };
  return {
    client: { messages: { batches } } as unknown as Anthropic,
    batches,
  };
}

// The poll waits ten seconds between checks. Fake timers keep the test fast
// without shortening the interval the real build uses.
async function drive<T>(promise: Promise<T>): Promise<T> {
  let settled = false;
  promise.then(
    () => (settled = true),
    () => (settled = true),
  );
  for (let i = 0; i < 50 && !settled; i++) {
    await vi.advanceTimersByTimeAsync(10_000);
  }
  return promise;
}

describe("the batched path", () => {
  it("sends the request unchanged and returns the message it gets back", async () => {
    vi.useFakeTimers();
    const { client, batches } = fakeClient({ type: "succeeded", message });
    const got = await drive(runMessage(client, params, { mode: "batch" }));
    vi.useRealTimers();

    expect(got.message).toBe(message);
    // Same model, same prompt, same settings: the only thing batch changes is
    // when the answer arrives. The params go through untouched.
    expect(batches.create).toHaveBeenCalledWith({
      requests: [{ custom_id: "document", params }],
    });
  });

  it("reports the usage once, when the answer arrives", async () => {
    vi.useFakeTimers();
    const { client } = fakeClient({ type: "succeeded", message });
    const onUsage = vi.fn();
    await drive(runMessage(client, params, { mode: "batch", onUsage }));
    vi.useRealTimers();

    expect(onUsage).toHaveBeenCalledTimes(1);
    expect(onUsage).toHaveBeenCalledWith({
      input_tokens: 40000,
      output_tokens: 30000,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 27000,
      cache_creation_1h_input_tokens: 0,
      // Marked, so the cost shown is half the live price and not the full one.
      batch: true,
    });
  });

  it("tells the user it is queued, cheaper, and safe to leave", async () => {
    vi.useFakeTimers();
    const { client } = fakeClient({ type: "succeeded", message }, 3);
    const notes: string[] = [];
    await drive(
      runMessage(client, params, {
        mode: "batch",
        label: "Reading the protocol",
        onProgress: (note) => notes.push(note),
      }),
    );
    vi.useRealTimers();

    expect(notes[0]).toContain("Queued as a batch");
    expect(notes[0]).toContain("half as much");
    expect(notes[0]).toContain("close this tab");
    expect(notes.at(-1)).toContain("Waiting on the batch");
  });

  it("cancels the batch when the user presses Stop", async () => {
    // Without this the batch runs on and is paid for when it ends, with nobody
    // waiting for it and nothing on the page to say so.
    vi.useFakeTimers();
    const { client, batches } = fakeClient({ type: "succeeded", message }, 99);
    const stop = new AbortController();
    const running = runMessage(client, params, { mode: "batch", signal: stop.signal });
    const outcome = running.then(
      () => "finished",
      () => "stopped",
    );

    await vi.advanceTimersByTimeAsync(25_000);
    stop.abort();
    await vi.advanceTimersByTimeAsync(0);
    vi.useRealTimers();

    expect(await outcome).toBe("stopped");
    expect(batches.cancel).toHaveBeenCalledWith("batch_1");
  });

  it("gives up after a day, and cancels on the way out", async () => {
    vi.useFakeTimers();
    const { client, batches } = fakeClient({ type: "succeeded", message }, 1e9);
    let clock = 0;
    const running = runMessage(client, params, { mode: "batch" }, () => clock);
    const outcome = running.catch((error) => error);

    // Let the batch be created and the start time taken, then let a day pass.
    await vi.advanceTimersByTimeAsync(0);
    clock = BATCH_TIMEOUT_MS + 1;
    await vi.advanceTimersByTimeAsync(10_000);
    vi.useRealTimers();

    const error = await outcome;
    expect(error).toBeInstanceOf(ModelCallError);
    expect(error.message).toContain("within a day");
    expect(batches.cancel).toHaveBeenCalled();
  });

  it.each([
    [{ type: "errored", error: { error: { message: "overloaded" } } } as Result, "overloaded"],
    [{ type: "canceled" } as Result, "cancelled"],
    [{ type: "expired" } as Result, "expired"],
  ])("says what happened when the result is %o", async (result, words) => {
    vi.useFakeTimers();
    const { client } = fakeClient(result);
    const outcome = runMessage(client, params, { mode: "batch" }).catch((e) => e);
    await drive(outcome);
    vi.useRealTimers();

    const error = await outcome;
    expect(error).toBeInstanceOf(ModelCallError);
    expect(error.message).toContain(words);
  });
});

describe("a batch a dead build left behind", () => {
  it("is collected instead of bought again", async () => {
    // The server died mid-build. The batch kept running at Anthropic and was
    // billed; sending a new one would pay for the same document twice.
    vi.useFakeTimers();
    const { client, batches } = fakeClient({ type: "succeeded", message }, 2, {
      batch_old: { status: "ended", succeeded: 1 },
    });
    const notes: string[] = [];
    const onBatch = vi.fn();
    const got = await drive(
      runMessage(client, params, {
        mode: "batch",
        resumeBatchId: "batch_old",
        onBatch,
        onProgress: (note) => notes.push(note),
      }),
    );
    vi.useRealTimers();

    expect(got.message).toBe(message);
    expect(batches.create).not.toHaveBeenCalled();
    expect(batches.results).toHaveBeenCalledWith("batch_old");
    expect(onBatch).toHaveBeenCalledWith("batch_old");
    expect(notes[0]).toContain("rather than paying for a second one");
  });

  it("is waited on if it is still running", async () => {
    vi.useFakeTimers();
    const { client, batches } = fakeClient({ type: "succeeded", message }, 2, {
      batch_old: { status: "in_progress", succeeded: 0 },
    });
    // Ends on the next check.
    batches.retrieve.mockImplementationOnce(async (id: string) => ({
      id,
      processing_status: "in_progress",
      request_counts: { succeeded: 0 },
    }));
    batches.retrieve.mockImplementation(async (id: string) => ({
      id,
      processing_status: "ended",
      request_counts: { succeeded: 1 },
    }));
    await drive(runMessage(client, params, { mode: "batch", resumeBatchId: "batch_old" }));
    vi.useRealTimers();

    expect(batches.create).not.toHaveBeenCalled();
  });

  it("is not resumed when the user stopped it, which sends a fresh one", async () => {
    // A stopped batch is cancelled and still recorded on its row. Resuming it
    // would fail every rebuild after a Stop with "cancelled".
    vi.useFakeTimers();
    const { client, batches } = fakeClient({ type: "succeeded", message }, 2, {
      batch_stopped: { status: "ended", succeeded: 0 },
    });
    const got = await drive(
      runMessage(client, params, { mode: "batch", resumeBatchId: "batch_stopped" }),
    );
    vi.useRealTimers();

    expect(got.message).toBe(message);
    expect(batches.create).toHaveBeenCalledTimes(1);
  });

  it("sends a fresh one when the old batch cannot be found at all", async () => {
    vi.useFakeTimers();
    const { client, batches } = fakeClient({ type: "succeeded", message });
    await drive(runMessage(client, params, { mode: "batch", resumeBatchId: "batch_gone" }));
    vi.useRealTimers();

    expect(batches.create).toHaveBeenCalledTimes(1);
  });

  it("stores the id of a new batch the moment it exists", async () => {
    vi.useFakeTimers();
    const { client } = fakeClient({ type: "succeeded", message }, 5);
    const onBatch = vi.fn();
    const running = runMessage(client, params, { mode: "batch", onBatch });
    await vi.advanceTimersByTimeAsync(0);
    // Before any waiting: a server that dies during the first poll must still
    // have left the id behind.
    expect(onBatch).toHaveBeenCalledWith("batch_1");
    await drive(running);
    vi.useRealTimers();
  });
});

describe("what a call reports it cost", () => {
  it("marks a batched call, and records the 1-hour share of the cache write", async () => {
    vi.useFakeTimers();
    const withWrites = {
      ...message,
      usage: {
        ...message.usage,
        cache_creation_input_tokens: 27000,
        cache_creation: { ephemeral_1h_input_tokens: 27000, ephemeral_5m_input_tokens: 0 },
      },
    } as unknown as Anthropic.Message;
    const { client } = fakeClient({ type: "succeeded", message: withWrites });
    const { usage } = await drive(runMessage(client, params, { mode: "batch" }));
    vi.useRealTimers();

    expect(usage.batch).toBe(true);
    expect(usage.cache_creation_1h_input_tokens).toBe(27000);
  });
});

describe("which lane a build takes", () => {
  it("batches unless it is told to go live", () => {
    const before = process.env.BUILD_MODE;
    delete process.env.BUILD_MODE;
    expect(buildMode()).toBe("batch");
    process.env.BUILD_MODE = "live";
    expect(buildMode()).toBe("live");
    // Anything else is the default, not an error: a typo in an env var should
    // cost time, not money.
    process.env.BUILD_MODE = "fast";
    expect(buildMode()).toBe("batch");
    if (before === undefined) delete process.env.BUILD_MODE;
    else process.env.BUILD_MODE = before;
  });

  it("says how long it has been waiting in words", () => {
    expect(waited(20_000)).toBe("less than a minute");
    expect(waited(60_000)).toBe("1 minute");
    expect(waited(14 * 60_000)).toBe("14 minutes");
    expect(waited(3 * 3_600_000)).toBe("3 hours");
  });
});
