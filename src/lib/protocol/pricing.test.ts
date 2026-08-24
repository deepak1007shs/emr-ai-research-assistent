import { describe, expect, it } from "vitest";
import { costOf, formatTokens, formatUsd, totalTokens } from "./pricing";

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
    // 16872*5/M + 23453*5*1.25/M + 21590*25/M
    expect(cost.input).toBeCloseTo(0.08436, 5);
    expect(cost.cacheWrite).toBeCloseTo(0.14658, 5);
    expect(cost.output).toBeCloseTo(0.53975, 5);
    expect(cost.total).toBeCloseTo(0.77069, 4);
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
