import {
  costOf,
  formatTokens,
  formatUsd,
  totalTokens,
  type TokenUsage,
} from "@/lib/protocol/pricing";

/**
 * What one document cost, broken down so the number is checkable rather than
 * simply asserted.
 *
 * It says only what happened on this run. It used to promise that "the next
 * review within the hour reads it at a tenth of the rate", which was true of
 * the pricing and never once true of this application: twelve reviews, twelve
 * cache writes, no reads. A line that describes how the bill could work, on a
 * panel that exists to show how it did, is the wrong kind of help.
 */
export function UsagePanel({
  usage,
  model,
  what = "review",
}: {
  usage: TokenUsage;
  model: string | null;
  /** The document this paid for, for the heading. */
  what?: "review" | "plan";
}) {
  const cost = costOf(model, usage);
  const readIn =
    usage.input_tokens + usage.cache_creation_input_tokens + usage.cache_read_input_tokens;
  const cacheHit = usage.cache_read_input_tokens > 0;
  const cacheWrite = usage.cache_creation_input_tokens > 0;

  const rows: [string, string, string][] = [
    ["Protocol and instructions read", formatTokens(usage.input_tokens), formatUsd(cost.input)],
    ...(cacheHit || cacheWrite
      ? [
          [
            cacheHit ? "Reference material, from cache" : "Reference material, written to cache",
            formatTokens(cacheHit ? usage.cache_read_input_tokens : usage.cache_creation_input_tokens),
            formatUsd(cacheHit ? cost.cacheRead : cost.cacheWrite),
          ] as [string, string, string],
        ]
      : []),
    [what === "plan" ? "Facts written" : "Review written", formatTokens(usage.output_tokens), formatUsd(cost.output)],
  ];

  return (
    <section className="no-print rounded-xl border border-border bg-surface px-5 py-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold">What this {what} cost</h2>
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
        {usage.batch && " Sent as a batch, at half the live price."}
        {cacheHit && " The reference material came from cache, at a tenth of the input rate."}
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
