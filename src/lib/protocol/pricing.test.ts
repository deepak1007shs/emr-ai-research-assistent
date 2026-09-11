import { describe, expect, it } from "vitest";
import { addUsage, costOf, formatTokens, formatUsd, totalTokens } from "./pricing";

/** The real usage recorded for the first completed review. */
const REAL_RUN = {
  input_tokens: 16872,
  output_tokens: 21590,
  cache_creation_input_tokens: 23453,
  cache_read_input_tokens: 0,
};

describe("costOf", () => {
  it("reproduces the measured Opus 5 review", () => {
    const cost = costOf("claude-opus-5", REAL_RUN);
    // 16872*5/M + 23453*5*2/M + 21590*25/M. The cache write is a 1-hour entry,
    // at twice the input rate. This test used to assert 1.25x - $0.147 where
    // the run cost $0.235 - because it was "measured" by the same function it
    // was checking. It is checked against the published price page now.
    expect(cost.input).toBeCloseTo(0.08436, 5);
    expect(cost.cacheWrite).toBeCloseTo(0.23453, 5);
    expect(cost.output).toBeCloseTo(0.53975, 5);
    expect(cost.total).toBeCloseTo(0.85864, 4);
  });

  it("charges Sonnet 5 at its standard $2 / $10", () => {
    // The published price page, 11 Sep 2026: the increase to $3/$15 scheduled
    // for 1 September was cancelled. A million of each at Sonnet 5 rates.
    const cost = costOf("claude-sonnet-5", {
      input_tokens: 1_000_000,
      output_tokens: 1_000_000,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
    });
    expect(cost.input).toBeCloseTo(2, 6);
    expect(cost.output).toBeCloseTo(10, 6);
  });

  it("bills a 5-minute cache write at 1.25x and a 1-hour one at 2x", () => {
    const base = {
      input_tokens: 0,
      output_tokens: 0,
      cache_creation_input_tokens: 1_000_000,
      cache_read_input_tokens: 0,
    };
    expect(
      costOf("claude-opus-5", { ...base, cache_creation_1h_input_tokens: 0 }).cacheWrite,
    ).toBeCloseTo(6.25, 6);
    expect(
      costOf("claude-opus-5", { ...base, cache_creation_1h_input_tokens: 1_000_000 })
        .cacheWrite,
    ).toBeCloseTo(10, 6);
    // Half and half.
    expect(
      costOf("claude-opus-5", { ...base, cache_creation_1h_input_tokens: 500_000 }).cacheWrite,
    ).toBeCloseTo(8.125, 6);
  });

  it("reads a row with no split as all 1-hour writes, which is what it was", () => {
    // Every cache write this application made before the split was recorded came
    // from the review's one 1-hour breakpoint.
    const legacy = costOf("claude-sonnet-5", REAL_RUN);
    const explicit = costOf("claude-sonnet-5", {
      ...REAL_RUN,
      cache_creation_1h_input_tokens: REAL_RUN.cache_creation_input_tokens,
    });
    expect(legacy.cacheWrite).toBeCloseTo(explicit.cacheWrite, 10);
  });

  it("halves every category for a batched call, cache included", () => {
    const run = { ...REAL_RUN, cache_read_input_tokens: 5_000 };
    const live = costOf("claude-sonnet-5", run);
    const batched = costOf("claude-sonnet-5", { ...run, batch: true });
    expect(batched.input).toBeCloseTo(live.input / 2, 10);
    expect(batched.cacheWrite).toBeCloseTo(live.cacheWrite / 2, 10);
    expect(batched.cacheRead).toBeCloseTo(live.cacheRead / 2, 10);
    expect(batched.output).toBeCloseTo(live.output / 2, 10);
    expect(batched.total).toBeCloseTo(live.total / 2, 10);
  });

  it("shows the same run on Sonnet 5 costing substantially less", () => {
    const opus = costOf("claude-opus-5", REAL_RUN).total;
    const sonnet = costOf("claude-sonnet-5", REAL_RUN).total;
    expect(sonnet).toBeLessThan(opus * 0.65);
  });

  it("charges a cache read at a tenth of the input rate", () => {
    const cold = costOf("claude-opus-5", { ...REAL_RUN, cache_creation_input_tokens: 10_000 });
    const warm = costOf("claude-opus-5", {
      ...REAL_RUN,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 10_000,
    });
    expect(warm.total).toBeLessThan(cold.total);
    expect(warm.cacheRead).toBeCloseTo((10_000 * 5) / 1_000_000 / 10, 6);
  });

  it("reports unknown rather than pretending an unknown model is free", () => {
    const cost = costOf("some-future-model", REAL_RUN);
    expect(cost.known).toBe(false);
    expect(cost.total).toBe(0);
  });
});

describe("formatting", () => {
  it("keeps small amounts visible instead of rounding them to zero", () => {
    expect(formatUsd(0.0042)).toBe("$0.0042");
    expect(formatUsd(0.77069)).toBe("$0.77");
    expect(formatUsd(0)).toBe("$0.00");
  });

  it("abbreviates token counts above a thousand", () => {
    expect(formatTokens(940)).toBe("940");
    expect(formatTokens(21590)).toBe("21.6k");
  });

  it("totals every billed token category", () => {
    expect(totalTokens(REAL_RUN)).toBe(16872 + 21590 + 23453);
  });
});

describe("addUsage", () => {
  const zero = {
    input_tokens: 0,
    output_tokens: 0,
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: 0,
  };

  it("keeps a batched job's discount through the sum", () => {
    // A job's running total starts at zero, which carries no flag. Dropping
    // the flag in the sum reported a batched job at twice what it cost.
    const stage = { ...REAL_RUN, batch: true };
    const total = addUsage(addUsage(zero, stage), stage);
    expect(total.batch).toBe(true);
    expect(costOf("claude-sonnet-5", total).total).toBeCloseTo(
      costOf("claude-sonnet-5", { ...addUsage(REAL_RUN, REAL_RUN), batch: false }).total / 2,
      10,
    );
  });

  it("keeps the 1-hour share of the cache writes through the sum", () => {
    const review = { ...REAL_RUN, cache_creation_1h_input_tokens: 23453 };
    const plan = { ...zero, input_tokens: 40000, output_tokens: 15000, cache_creation_1h_input_tokens: 0 };
    const total = addUsage(review, plan);
    expect(total.cache_creation_1h_input_tokens).toBe(23453);
    expect(costOf("claude-sonnet-5", total).cacheWrite).toBeCloseTo(
      (23453 * 2 * 2) / 1_000_000,
      10,
    );
  });

  it("does not mark a live job as batched", () => {
    expect(addUsage(zero, REAL_RUN).batch).toBeUndefined();
  });
});
