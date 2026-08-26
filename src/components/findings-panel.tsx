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

      <ul className="mt-3 space-y-2">
        {[...errors, ...warnings].map((finding, i) => (
          <li key={i} className="flex gap-2 text-xs leading-relaxed">
            <span
              className={`mt-0.5 shrink-0 rounded px-1 font-mono text-[0.65rem] ${
                finding.severity === "ERROR"
                  ? "bg-danger-soft text-danger"
                  : "bg-warn-soft text-warn"
              }`}
            >
              {finding.code}
            </span>
            <span>{finding.message}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
