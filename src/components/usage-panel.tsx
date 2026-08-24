import {
  costOf,
  formatTokens,
  formatUsd,
  totalTokens,
  type TokenUsage,
} from "@/lib/protocol/pricing";

/**
 * What this one review cost, broken down so the number is checkable rather than
 * simply asserted.
 */
export function UsagePanel({
  usage,
  model,
}: {
  usage: TokenUsage;
  model: string | null;
}) {
  const cost = costOf(model, usage);
  const readIn =
    usage.input_tokens + usage.cache_creation_input_tokens + usage.cache_read_input_tokens;
  const cacheHit = usage.cache_read_input_tokens > 0;

  const rows: [string, string, string][] = [
    ["Protocol and prompt read", formatTokens(usage.input_tokens), formatUsd(cost.input)],
    [
      cacheHit ? "Knowledge base (from cache)" : "Knowledge base (cached this run)",
      formatTokens(cacheHit ? usage.cache_read_input_tokens : usage.cache_creation_input_tokens),
      formatUsd(cacheHit ? cost.cacheRead : cost.cacheWrite),
    ],
    ["Review written", formatTokens(usage.output_tokens), formatUsd(cost.output)],
  ];

  return (
    <section className="no-print rounded-xl border border-border bg-surface px-5 py-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold">What this review cost</h2>
        <p className="font-mono text-sm">
          {cost.known ? formatUsd(cost.total) : "cost unknown"}
        </p>
      </div>

      <table className="mt-3 w-full text-xs">
        <tbody>
          {rows.map(([label, tokens, amount]) => (
            <tr key={label} className="border-t border-border">
              <td className="py-1.5 text-muted">{label}</td>
              <td className="py-1.5 text-right font-mono">{tokens}</td>
              <td className="w-20 py-1.5 text-right font-mono">{cost.known ? amount : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <p className="mt-3 text-xs text-muted">
        {formatTokens(totalTokens(usage))} tokens total ({formatTokens(readIn)} in,{" "}
        {formatTokens(usage.output_tokens)} out) on{" "}
        <span className="font-mono">{model ?? "an unknown model"}</span>.
        {cacheHit
          ? " The knowledge base came from cache, at a tenth of the usual rate."
          : " The knowledge base was written to cache this run; the next review within the hour reads it at a tenth of the rate."}
      </p>
    </section>
  );
}

/** The running total across every review the signed-in user has run. */
export function UsageTotal({
  rows,
}: {
  rows: { model: string | null; usage: TokenUsage | null }[];
}) {
  const priced = rows.filter((r) => r.usage);
  if (!priced.length) return null;

  const total = priced.reduce((sum, r) => sum + costOf(r.model, r.usage!).total, 0);
  const tokens = priced.reduce((sum, r) => sum + totalTokens(r.usage!), 0);

  return (
    <p className="text-xs text-muted">
      {priced.length} {priced.length === 1 ? "review" : "reviews"} ·{" "}
      {formatTokens(tokens)} tokens · <span className="font-mono">{formatUsd(total)}</span> spent
      in total, averaging{" "}
      <span className="font-mono">{formatUsd(total / priced.length)}</span> each.
    </p>
  );
}
