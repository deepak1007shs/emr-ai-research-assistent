/**
 * What a call actually cost.
 *
 * Rates are US dollars per million tokens, from Anthropic's published pricing.
 * Cache writes bill at 1.25x the input rate and cache reads at 0.1x, which is
 * why a warm run is so much cheaper than a cold one.
 *
 * Sonnet 5 carries a lower introductory rate until 31 Aug 2026. The standard
 * rate is used here deliberately: a figure that is slightly high during the
 * intro window is safer than one that silently under-reports afterwards.
 */

export type TokenUsage = {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens: number;
  cache_read_input_tokens: number;
};

type Rate = { input: number; output: number };

const RATES: Record<string, Rate> = {
  "claude-fable-5": { input: 10, output: 50 },
  "claude-opus-5": { input: 5, output: 25 },
  "claude-opus-4-8": { input: 5, output: 25 },
  "claude-opus-4-7": { input: 5, output: 25 },
  "claude-opus-4-6": { input: 5, output: 25 },
  "claude-sonnet-5": { input: 3, output: 15 },
  "claude-sonnet-4-6": { input: 3, output: 15 },
  "claude-haiku-4-5": { input: 1, output: 5 },
};

const CACHE_WRITE_MULTIPLIER = 1.25;
const CACHE_READ_MULTIPLIER = 0.1;

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

  const perToken = (millions: number) => millions / 1_000_000;
  const input = usage.input_tokens * perToken(rate.input);
  const cacheWrite =
    usage.cache_creation_input_tokens * perToken(rate.input) * CACHE_WRITE_MULTIPLIER;
  const cacheRead =
    usage.cache_read_input_tokens * perToken(rate.input) * CACHE_READ_MULTIPLIER;
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
