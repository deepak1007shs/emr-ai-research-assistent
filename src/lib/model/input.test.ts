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

// Re-pinned on 11 Sep 2026 for the move from Sonnet 5 at `high` to Opus 5 at
// `xhigh`, with the output budget raised from 64,000 to 128,000. The output was
// meant to change. Nothing else in the request was: set those three back to
// their old values and both requests hash to the previous pins exactly -
// 36521b388f2788b1 for the review and 18534a4c09e4fd9b for the facts.
const REVIEW = "7f83f9a7cbbdf781";
// Re-pinned again the same day, for the facts only, when the first real run
// showed the API cannot compile the Facts Sheet's schema as a grammar. Three
// things changed and nothing else: `output_config.format` removed, the schema
// added to the system prompt as text, and the instruction's last line. The
// schema itself was also corrected: eight fields where the model's schema and
// the parser disagreed, and fifteen nullable text fields made plain text.
// Re-pinned on 12 Sep 2026, when the outcome chain gained `kind` and
// `exposures`. The output is meant to change, and this is the one change so far
// made to improve it rather than to cut the bill: a cohort study whose factors
// are variables rather than arms had no field to say so, so its plan estimated
// eleven proportions, fitted no model, and left thirteen correctly read
// covariates unused. The model is now asked which of a comparison, an
// association, an accuracy or an estimation each outcome is, and which factors
// it is about. Nothing else in the request moved: take the two fields out of
// `outcomeChain` and it hashes to 3e7e238ee471e506 again.
const FACTS = "f2687ad23fa6d4b2";

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
