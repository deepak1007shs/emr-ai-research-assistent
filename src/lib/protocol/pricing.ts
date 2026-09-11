/**
 * What a call actually cost.
 *
 * Rates are US dollars per million tokens, from Anthropic's published pricing
 * page, checked 11 Sep 2026. Three multipliers sit on top of them, and all
 * three stack:
 *
 * - a cache write bills at 1.25x the input rate for a 5-minute entry and at 2x
 *   for a 1-hour entry;
 * - a cache read bills at 0.1x;
 * - a batched call bills at half of everything, output included.
 *
 * This file used to charge every cache write at 1.25x, when the only cache this
 * application has ever written is a 1-hour one, so the review's cache write was
 * under-reported by more than a third. And it charged Sonnet 5 at $3/$15, on the
 * reasoning that a figure slightly high during the introductory window was
 * safer than one that under-reported after it. The window ended and the
 * increase was cancelled: $2/$10 is the standard price, and the old figure made
 * every review look about 45% dearer than it was. A number that is wrong in the
 * cautious direction is still wrong, and this one was used to decide what to
 * spend.
 */

export type TokenUsage = {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens: number;
  cache_read_input_tokens: number;
  /**
   * Of the cache writes, those that were 1-hour entries, at 2x rather than 1.25x.
   *
   * Absent on rows written before the split was recorded. Every cache write
   * those rows hold came from the review's single 1-hour breakpoint, so absent
   * is read as "all of them".
   */
  cache_creation_1h_input_tokens?: number;
  /** True where the call went through the Batch API, at half price. */
  batch?: boolean;
};

type Rate = { input: number; output: number };

const RATES: Record<string, Rate> = {
  "claude-fable-5": { input: 10, output: 50 },
  "claude-opus-5": { input: 5, output: 25 },
  "claude-opus-4-8": { input: 5, output: 25 },
  "claude-opus-4-7": { input: 5, output: 25 },
  "claude-opus-4-6": { input: 5, output: 25 },
  "claude-sonnet-5": { input: 2, output: 10 },
  "claude-sonnet-4-6": { input: 3, output: 15 },
  "claude-haiku-4-5": { input: 1, output: 5 },
};

const CACHE_WRITE_5M = 1.25;
const CACHE_WRITE_1H = 2;
const CACHE_READ = 0.1;
const BATCH = 0.5;

export type CostBreakdown = {
  input: number;
  cacheWrite: number;
  cacheRead: number;
  output: number;
  total: number;
  /** False when the model is unknown, so the caller can say so rather than show $0.00. */
  known: boolean;
};

export function costOf(model: string | null | undefined, usage: TokenUsage): CostBreakdown {
  const rate = model ? RATES[model] : undefined;
  if (!rate) {
    return { input: 0, cacheWrite: 0, cacheRead: 0, output: 0, total: 0, known: false };
  }

  // The batch discount applies to every category, cache writes and reads
  // included: the multipliers stack.
  const discount = usage.batch ? BATCH : 1;
  const perToken = (millions: number) => (millions / 1_000_000) * discount;

  const oneHour = Math.min(
    usage.cache_creation_1h_input_tokens ?? usage.cache_creation_input_tokens,
    usage.cache_creation_input_tokens,
  );
  const fiveMinute = usage.cache_creation_input_tokens - oneHour;

  const input = usage.input_tokens * perToken(rate.input);
  const cacheWrite =
    oneHour * perToken(rate.input) * CACHE_WRITE_1H +
    fiveMinute * perToken(rate.input) * CACHE_WRITE_5M;
  const cacheRead = usage.cache_read_input_tokens * perToken(rate.input) * CACHE_READ;
  const output = usage.output_tokens * perToken(rate.output);

  return {
    input,
    cacheWrite,
    cacheRead,
    output,
    total: input + cacheWrite + cacheRead + output,
    known: true,
  };
}

/** "$0.77", or "$0.0042" for amounts that would round away to nothing. */
export function formatUsd(amount: number): string {
  if (amount === 0) return "$0.00";
  if (amount < 0.01) return `$${amount.toFixed(4)}`;
  return `$${amount.toFixed(2)}`;
}

export function formatTokens(count: number): string {
  if (count < 1000) return String(count);
  return `${(count / 1000).toFixed(1)}k`;
}

/** Total tokens billed, for a single "size of this job" number. */
export function totalTokens(usage: TokenUsage): number {
  return (
    usage.input_tokens +
    usage.output_tokens +
    usage.cache_creation_input_tokens +
    usage.cache_read_input_tokens
  );
}

/**
 * Two stages' usage as one.
 *
 * Carries the 1-hour share of the cache writes and the batch flag through the
 * sum, because `costOf` prices by both: dropping them reports a batched job at
 * twice what it cost. One process runs one lane, so the stages of a job are
 * either all batched or all live.
 */
export const addUsage = (a: TokenUsage, b: TokenUsage): TokenUsage => ({
  input_tokens: a.input_tokens + b.input_tokens,
  output_tokens: a.output_tokens + b.output_tokens,
  cache_creation_input_tokens: a.cache_creation_input_tokens + b.cache_creation_input_tokens,
  cache_read_input_tokens: a.cache_read_input_tokens + b.cache_read_input_tokens,
  cache_creation_1h_input_tokens:
    (a.cache_creation_1h_input_tokens ?? a.cache_creation_input_tokens) +
    (b.cache_creation_1h_input_tokens ?? b.cache_creation_input_tokens),
  ...(a.batch || b.batch ? { batch: true } : {}),
});
