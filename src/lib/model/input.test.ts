import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

/**
 * What the model receives, pinned.
 *
 * The rule for every change made to cut the bill: the output must not be
 * affected in any way. The only way that holds is if the model receives exactly
 * the same request, so this test fingerprints the request each document call
 * sends - model, settings, schema, system prompt, reference material, the
 * protocol message - and fails on any change to it.
 *
 * The batched and live lanes must send the same bytes. So must every future
 * cost change. When a change to what the model reads is wanted - a prompt
 * tuned, a reference file edited, a model moved - update the fingerprint on
 * purpose, and say in the commit that the output is expected to change.
 *
 * `cache_control` is left out of the fingerprint. It decides what a request
 * costs and not what the model sees, which is why it could be removed from the
 * review without touching a word of the review.
 *
 * Pinned on 11 Sep 2026, and at that point equal to the requests sent before
 * the cost work began (commit 025a23a): the old and new code were run side by
 * side and hashed the same.
 */

const captured: unknown[] = [];

vi.mock("@anthropic-ai/sdk", () => {
  class Captured extends Error {}
  class Fake {
    messages = {
      stream: (params: unknown) => {
        captured.push(params);
        throw new Captured("captured");
      },
      batches: {
        create: async (body: { requests: { params: unknown }[] }) => {
          captured.push(body.requests[0].params);
          throw new Captured("captured");
        },
      },
    };
  }
  return { default: Fake, Anthropic: Fake };
});

const withoutMarkers = (value: unknown) =>
  JSON.stringify(
    JSON.parse(JSON.stringify(value), (key, v) => (key === "cache_control" ? undefined : v)),
  );

const fingerprint = (value: unknown) =>
  createHash("sha256").update(withoutMarkers(value)).digest("hex");

// The same stand-in protocol the side-by-side comparison used, so the pinned
// values are the ones shown equal to the pre-cost-work requests. The filename
// is part of what the model reads, so changing it changes the fingerprint.
const protocol = { kind: "text" as const, text: "A protocol.", filename: "p.docx", bytes: 11 };

async function requestOf(run: () => Promise<unknown>) {
  captured.length = 0;
  await run().catch(() => undefined);
  expect(captured, "the request was captured").toHaveLength(1);
  return captured[0];
}

const REVIEW = "36521b388f2788b1";
const FACTS = "18534a4c09e4fd9b";

describe("what the model receives", () => {
  process.env.ANTHROPIC_API_KEY = "test";

  it.each(["live", "batch"] as const)("is unchanged for the review, %s", async (mode) => {
    const { analyzeProtocol } = await import("../protocol/analyze.ts");
    const request = await requestOf(() => analyzeProtocol(protocol, { mode }));
    expect(fingerprint(request).slice(0, 16)).toBe(REVIEW);
  });

  it.each(["live", "batch"] as const)("is unchanged for the facts, %s", async (mode) => {
    const { extractFacts } = await import("../facts/extract.ts");
    const request = await requestOf(() => extractFacts(protocol, { mode }));
    expect(fingerprint(request).slice(0, 16)).toBe(FACTS);
  });

  it("carries no cache marker on the review, which is billing and not content", async () => {
    const { analyzeProtocol } = await import("../protocol/analyze.ts");
    const request = await requestOf(() => analyzeProtocol(protocol, { mode: "live" }));
    expect(JSON.stringify(request)).not.toContain("cache_control");
  });
});
