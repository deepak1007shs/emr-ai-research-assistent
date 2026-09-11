import { gateA } from "@/lib/facts/gate";
import type { FactsSheet } from "@/lib/study/types";

/**
 * A plan that Gate A stopped before any table was built.
 *
 * The protocol was read and paid for, and the Facts Sheet is kept. What this
 * shows is the part of it the gate is about - the design and the primary
 * outcome - beside each check that failed, because the fix is nearly always in
 * the gap between what the protocol was read as saying and what the
 * investigator meant it to say.
 *
 * Nothing here is computed except the gate itself, which is the same pure
 * function the runner used, over the same stored facts.
 */
export function GateAStopped({ facts }: { facts: FactsSheet }) {
  const failed = gateA(facts).filter((check) => !check.pass);
  const primary = facts.primary;

  return (
    <section className="card space-y-4 p-6">
      <div>
        <h1 className="text-base font-semibold">Gate A stopped this plan before it was built</h1>
        <p className="mt-1.5 max-w-prose text-sm text-muted">
          The plan does not start until the design and the primary outcome are settled, because
          every table would rest on the gap. The protocol was read, and what it was read as saying
          is kept below.
        </p>
      </div>

      <ul className="space-y-2">
        {failed.map((check) => (
          <li key={check.id} className="pill block bg-danger-soft text-danger">
            <span className="font-mono font-semibold">{check.id}</span> {check.message}
          </li>
        ))}
      </ul>

      <div className="overflow-hidden rounded-lg border border-line">
        <p className="border-b border-line bg-surface-sunken px-3.5 py-2 text-2xs font-semibold tracking-wide text-ink-3 uppercase">
          What the protocol was read as saying
        </p>
        <dl className="divide-y divide-line text-sm">
          {[
            ["Design", `${facts.design_label || "No label"} (${facts.design.replace(/_/g, " ")})`],
            ["Reporting guideline", facts.guideline || "None stated"],
            ["Primary outcome", primary.what || "Not stated"],
            ["Measured how", primary.how || "Not stated"],
            ["Instrument", primary.instrument || "Not stated"],
            ["At which visits", primary.time.join(", ") || "Not stated"],
            ["Unit and type", `${primary.unit || "no unit"}, ${primary.type.replace(/_/g, " ")}`],
            [
              "Groups",
              facts.groups.length
                ? facts.groups.map((g) => `${g.code} (${g.label})`).join(", ")
                : "A single group",
            ],
          ].map(([term, value]) => (
            <div key={term} className="flex gap-3 px-3.5 py-2">
              <dt className="w-40 shrink-0 text-ink-3">{term}</dt>
              <dd className="min-w-0 text-ink">{value}</dd>
            </div>
          ))}
        </dl>
      </div>

      <p className="max-w-prose text-xs text-ink-3">
        Building again reads the protocol again and is billed again. It is worth doing once the
        protocol says what the checks above ask for.
      </p>
    </section>
  );
}
