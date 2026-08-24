import type { StudySpec } from "@/lib/study-spec/types";

/**
 * The decisions the specification encodes, in plain language.
 *
 * Gate G0 exists because the validator proves the four documents agree with
 * each other, not that the study is right. This is what the investigator reads
 * before signing, so it shows judgements rather than JSON.
 */
export function SpecDecisions({ spec }: { spec: StudySpec }) {
  const primaryObjective = spec.objectives.find((o) => o.tier === "primary");
  const primaryOutcome = spec.outcomes.find((o) => o.tier === "primary");
  const primaryAnalysis = spec.analyses.find((a) => a.outcome_id === primaryOutcome?.id);
  const byId = new Map(spec.variables.map((v) => [v.id, v]));

  const captured = spec.variables.filter((v) => v.crf);
  const derived = spec.variables.filter((v) => v.role === "derived");
  const covariates = (primaryAnalysis?.covariate_ids ?? [])
    .map((id) => byId.get(id)?.label ?? id);

  const decisions: [string, string][] = [
    ["Study design", `${spec.study.design.replace(/_/g, " ")}, reported to ${spec.study.guideline}`],
    ["Primary objective", primaryObjective?.question ?? "none identified"],
    [
      "Primary outcome",
      primaryOutcome
        ? `${primaryOutcome.label}. ${primaryOutcome.definition} Measured by ${primaryOutcome.instrument}, summarised as ${primaryOutcome.summary_statistic}.`
        : "none identified",
    ],
    [
      "How it will be analysed",
      primaryAnalysis
        ? `${primaryAnalysis.unadjusted_test.replace(/_/g, " ")} unadjusted${
            primaryAnalysis.adjusted_model
              ? `, then ${primaryAnalysis.adjusted_model.replace(/_/g, " ")} adjusted for ${covariates.join(", ") || "nothing"}`
              : ", with no adjusted model"
          }`
        : "no analysis defined",
    ],
    [
      "Sample size",
      `${spec.sample_size.n_total} in total, powered on ${
        spec.outcomes.find((o) => o.id === spec.sample_size.powered_outcome_id)?.label ??
        spec.sample_size.powered_outcome_id
      }, using the ${spec.sample_size.formula.replace(/_/g, " ")} formula`,
    ],
    [
      "What the form collects",
      `${captured.length} fields across ${spec.crf_sections.length} sections`,
    ],
    [
      "What is computed, not collected",
      derived.length
        ? derived.map((v) => v.label).join(", ")
        : "nothing is derived; every value is collected directly",
    ],
    ["Tables to be reported", `${spec.tables.length}`],
  ];

  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-base font-semibold">Read these decisions before signing</h2>
        <p className="mt-1 text-sm text-muted">
          The gate has checked that the case record form, the analysis plan and the tables
          agree with one another. It cannot check that the study is right. That judgement
          is yours, and it is what signing means.
        </p>
      </div>

      <dl className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
        {decisions.map(([label, value]) => (
          <div key={label} className="grid gap-1 px-4 py-3 sm:grid-cols-[13rem_1fr] sm:gap-4">
            <dt className="text-xs font-semibold text-muted sm:pt-0.5">{label}</dt>
            <dd className="text-sm leading-relaxed">{value}</dd>
          </div>
        ))}
      </dl>

      {covariates.length > 0 && (
        <p className="rounded-lg bg-warn-soft px-3 py-2.5 text-sm">
          <span className="font-semibold">Check the adjustment set.</span> Adjusting for{" "}
          {covariates.join(", ")} is a causal claim: each must be a confounder, not
          something on the pathway between the exposure and the outcome. Adjusting for a
          mediator removes the effect you are measuring.
        </p>
      )}

      {spec.open_items && spec.open_items.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-semibold">Choices made on your behalf</h3>
          <p className="mb-2 text-sm text-muted">
            The protocol was silent on these, so a standard answer was used. Change the
            specification if you disagree.
          </p>
          <ul className="space-y-2">
            {spec.open_items.map((item) => (
              <li key={item.id} className="flex gap-2.5 text-sm leading-relaxed">
                <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-accent" />
                <span>
                  {item.question} <span className="text-muted">({item.owner})</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

type Finding = { code: string; severity: string; path: string; message: string };

function FindingGroup({
  items,
  heading,
  tone,
}: {
  items: Finding[];
  heading: string;
  tone: string;
}) {
  if (!items.length) return null;
  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold">{heading}</h3>
      <ul className="space-y-2">
        {items.map((f, i) => (
          <li key={i} className={`rounded-lg px-3 py-2.5 text-sm leading-relaxed ${tone}`}>
            <span className="font-mono text-xs font-semibold">{f.code}</span>{" "}
            <span className="font-mono text-xs text-muted">{f.path}</span>
            <p className="mt-1">{f.message}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The gate's findings, grouped so errors cannot be missed. */
export function SpecFindings({ findings }: { findings: Finding[] }) {
  if (!findings.length) return null;
  return (
    <section className="space-y-4">
      <FindingGroup
        items={findings.filter((f) => f.severity === "ERROR")}
        heading="Must be fixed before this can be signed"
        tone="bg-danger-soft text-danger"
      />
      <FindingGroup
        items={findings.filter((f) => f.severity === "WARN")}
        heading="Worth checking"
        tone="bg-warn-soft"
      />
    </section>
  );
}
