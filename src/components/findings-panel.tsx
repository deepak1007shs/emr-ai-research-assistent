import type { Finding } from "@/lib/sap/validate";

/**
 * What the checks found when the document was built.
 *
 * These have been recorded since the validators existed and never shown: the
 * build reported a count and the detail stayed in the database. A count tells
 * you something is wrong; only the finding tells you what.
 */
export function FindingsPanel({ findings }: { findings: Finding[] }) {
  if (!findings.length) return null;

  const errors = findings.filter((f) => f.severity === "ERROR");
  const warnings = findings.filter((f) => f.severity === "WARN");

  return (
    <section className="no-print card p-4">
      <h2 className="text-sm font-semibold">
        {errors.length
          ? `${errors.length} problem${errors.length === 1 ? "" : "s"} to look at`
          : `${warnings.length} thing${warnings.length === 1 ? "" : "s"} worth a look`}
      </h2>
      <p className="mt-1 text-xs text-muted">
        Found when this document was built. It is still downloadable; these are the
        judgements a supervisor would make on it.
      </p>

      {/* A coloured edge rather than a badge alone: a list of twenty findings is
          scanned for the serious ones before any of it is read. */}
      <ul className="mt-3 space-y-1.5">
        {[...errors, ...warnings].map((finding, i) => (
          <li
            key={i}
            className={`flex gap-2 rounded-r-md border-l-2 py-1.5 pr-2 pl-2.5 text-xs leading-relaxed ${
              finding.severity === "ERROR"
                ? "border-danger bg-danger-soft/45"
                : "border-amber bg-amber-50/50"
            }`}
          >
            <span
              className={`mt-px shrink-0 font-mono text-[0.65rem] font-semibold ${
                finding.severity === "ERROR" ? "text-danger" : "text-amber"
              }`}
            >
              {finding.code}
            </span>
            <span className="text-ink-2">{finding.message}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
