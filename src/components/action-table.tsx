import type { ActionSpec } from "@/lib/protocol/schema";

/**
 * The short action document, on screen.
 *
 * Same four columns the builder renders — Area | Issue in the study |
 * Change needed | Priority — with the rank shown as the leading number.
 */
export function ActionTable({ spec }: { spec: ActionSpec }) {
  const rows = spec.issues_table.rows;
  if (!rows.length) return null;

  return (
    <section className="rounded-xl border border-border bg-surface p-5">
      <h2 className="text-base font-semibold tracking-tight">Act on these first</h2>
      <p className="mt-1 text-sm text-muted">
        {rows.length} {rows.length === 1 ? "blocker" : "blockers"}, in the order to address
        them. The full review below carries the reasoning and the smaller corrections.
      </p>

      <ol className="mt-4 space-y-3">
        {rows.map(([area, issue, change], i) => (
          <li key={i} className="flex gap-3">
            <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-semibold text-white">
              {i + 1}
            </span>
            <div className="min-w-0">
              <p className="text-xs font-semibold tracking-wide text-muted uppercase">{area}</p>
              <p className="mt-0.5 text-sm leading-relaxed">{issue}</p>
              <p className="mt-1.5 text-sm leading-relaxed">
                <span className="font-semibold">Do this: </span>
                {change}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
