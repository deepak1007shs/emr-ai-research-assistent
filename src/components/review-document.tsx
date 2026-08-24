import type { ReviewSpec } from "@/lib/protocol/schema";

/**
 * The on-screen review.
 *
 * Headings and structure follow the vendored `build_review_md.js` exactly, so
 * what the user reads here is what the .md and .docx downloads contain.
 */

function Section({
  number,
  title,
  children,
}: {
  number: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-t border-border pt-8">
      <h2 className="text-lg font-semibold tracking-tight">
        <span className="text-muted">{number}.</span> {title}
      </h2>
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <p className="text-sm leading-relaxed">
      <span className="font-semibold">{label}</span> {value}
    </p>
  );
}

function Suggestions({ items }: { items: string[] }) {
  if (!items.length) return null;
  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold text-muted">
        Suggestions (only what is needed)
      </h3>
      <ul className="space-y-2">
        {items.map((item, i) => (
          <li key={i} className="flex gap-2.5 text-sm leading-relaxed">
            <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-accent" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** An objective bullet with its outcome nested beneath, as the builder renders it. */
function ObjectiveItem({
  text,
  outcomeLabel,
  outcome,
  bold = false,
}: {
  text: string;
  outcomeLabel: string;
  outcome: string;
  bold?: boolean;
}) {
  return (
    <li className="text-sm leading-relaxed">
      <p className={bold ? "font-semibold" : undefined}>{text}</p>
      {outcome && (
        <p className="mt-1.5 border-l-2 border-border pl-3 text-muted">
          <span className="font-semibold text-foreground">{outcomeLabel}</span> {outcome}
        </p>
      )}
    </li>
  );
}

/** Splits "PARTLY correct. The formula is right…" into its chip and the rest. */
function splitVerdict(verdict: string): [string, string] {
  const match = verdict.match(/^(PARTLY correct|Partly correct|Partial|Correct|Wrong formula|Absent)/i);
  if (!match) return [verdict, ""];
  return [match[0], verdict.slice(match[0].length).replace(/^[.\s]+/, "")];
}

function verdictTone(keyword: string): string {
  const v = keyword.toLowerCase();
  if (v.startsWith("wrong") || v.startsWith("absent")) return "bg-danger-soft text-danger";
  if (v.startsWith("correct")) return "bg-accent-soft";
  return "bg-warn-soft";
}

export function ReviewDocument({ spec }: { spec: ReviewSpec }) {
  const [verdictKeyword, verdictRest] = splitVerdict(spec.sample_size.verdict);
  const framework = spec.peco.framework === "PICO" ? "PICO" : "PECO";
  const questionKind = framework === "PICO" ? "Intervention" : "Exposure";

  return (
    <article className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">
          Protocol Understanding &amp; Review
        </h1>
        <p className="mt-1 text-sm italic text-muted">{spec.subtitle}</p>
        {spec.protocol_line && (
          <p className="mt-4 border-t border-border pt-4 text-sm font-semibold leading-relaxed">
            {spec.protocol_line}
          </p>
        )}
      </header>

      <Section number={1} title="Title of the Study">
        <p className="text-sm leading-relaxed">
          <span className="font-semibold">As written:</span>{" "}
          <span className="italic">{spec.title.as_written}</span>
        </p>
        <Suggestions items={spec.title.suggestions} />
      </Section>

      <Section number={2} title="Type of the Study">
        <Fact label="Correct classification:" value={spec.type.classification} />
        <Suggestions items={spec.type.suggestions} />
      </Section>

      <Section number={3} title={`${framework} (${questionKind} question)`}>
        {spec.peco.intro && <p className="text-sm leading-relaxed">{spec.peco.intro}</p>}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[32rem] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="py-2 pr-4 font-semibold">Element</th>
                <th className="py-2 font-semibold">Content</th>
              </tr>
            </thead>
            <tbody>
              {spec.peco.rows.map(([element, content], i) => (
                <tr key={i} className="border-b border-border align-top last:border-0">
                  <td className="py-2.5 pr-4 font-medium whitespace-nowrap">{element}</td>
                  <td className="py-2.5 leading-relaxed">{content}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section number={4} title="Objectives and Their Outcomes">
        <div>
          <h3 className="mb-2 text-sm font-semibold text-muted">Primary objective</h3>
          <ul className="rounded-xl border border-border bg-surface p-4">
            <ObjectiveItem
              bold
              text={spec.objectives.primary.objective}
              outcomeLabel="Primary outcome:"
              outcome={spec.objectives.primary.outcome}
            />
          </ul>
        </div>

        {spec.objectives.secondary.length > 0 && (
          <div>
            <h3 className="mb-2 text-sm font-semibold text-muted">
              Secondary objectives and their outcomes
            </h3>
            <ul className="space-y-3">
              {spec.objectives.secondary.map((o, i) => (
                <ObjectiveItem
                  key={i}
                  text={o.objective}
                  outcomeLabel="Outcome:"
                  outcome={o.outcome}
                />
              ))}
            </ul>
          </div>
        )}

        {spec.objectives.exploratory.length > 0 && (
          <div>
            <h3 className="mb-2 text-sm font-semibold text-muted">
              Exploratory objectives (extra analyses that can be done)
            </h3>
            <ul className="space-y-3">
              {spec.objectives.exploratory.map((o, i) => (
                <ObjectiveItem key={i} text={o.text} outcomeLabel="Outcome:" outcome={o.outcome} />
              ))}
            </ul>
          </div>
        )}
      </Section>

      <Section number={5} title="Sample Size — Is It Correct? Any Issues?">
        {spec.sample_size.what_they_did && (
          <Fact label="What the protocol did:" value={spec.sample_size.what_they_did} />
        )}
        <p className="text-sm leading-relaxed">
          <span className="font-semibold">Verdict: </span>
          <span
            className={`rounded-md px-2 py-0.5 text-sm font-medium ${verdictTone(verdictKeyword)}`}
          >
            {verdictKeyword}
          </span>
          {verdictRest && <span> {verdictRest}</span>}
        </p>
        {spec.sample_size.issues.length > 0 && (
          <div>
            <h3 className="mb-2 text-sm font-semibold text-muted">Issues to fix</h3>
            <ul className="space-y-2">
              {spec.sample_size.issues.map((item, i) => (
                <li key={i} className="flex gap-2.5 text-sm leading-relaxed">
                  <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-accent" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Section>

      <Section number={6} title="Very Important Issues to Address (in plain words)">
        <p className="text-sm leading-relaxed">
          The most important things to fix before the study starts:
        </p>
        <ol className="space-y-5">
          {spec.key_issues.map(([heading, body], i) => (
            <li key={i}>
              <h3 className="text-sm font-semibold">
                {i + 1}. {heading}
              </h3>
              <p className="mt-1.5 text-sm leading-relaxed">{body}</p>
            </li>
          ))}
        </ol>
      </Section>

      {spec.footer && (
        <p className="border-t border-border pt-6 text-sm italic leading-relaxed text-muted">
          {spec.footer}
        </p>
      )}
    </article>
  );
}
