import type { ShellTable } from "@/lib/study/types";
import type { SapBuild } from "@/lib/sap/build";
import { DIAGNOSTIC_NOTE } from "@/lib/study/diagnostic";
import { labelOf as words } from "@/lib/variables/name";

/**
 * How a variable is written for a reader: its label, not the name code uses.
 *
 * The name is lower case with underscores and is often the outcome's whole
 * sentence. The variable list already carries the words a person reads.
 */
const labelOf = (build: SapBuild, name: string) => words(build.variables, name);

/**
 * The plan on screen, laid out the way the .docx lays it out.
 *
 * The same objects the renderer reads, drawn as HTML rather than as markdown,
 * so what you check here is what you download. Nothing is computed in this
 * file: a component that worked anything out would be a second place the plan
 * is decided, and the whole build exists to have exactly one.
 */

const BLOCKS: { key: ShellTable["block"]; heading: string }[] = [
  { key: "descriptive", heading: "Descriptive characteristics" },
  { key: "primary", heading: "Primary outcome" },
  { key: "secondary", heading: "Secondary outcomes" },
  { key: "exploratory", heading: "Exploratory analyses" },
];

/** Bold TODO inside a label, as the house style prints it. */
function Label({ text }: { text: string }) {
  const parts = text.split(/(\*\*TODO:\*\*)/g);
  return (
    <>
      {parts.map((part, i) =>
        part === "**TODO:**" ? (
          <strong key={i} className="text-warn">
            TODO:
          </strong>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}

function Shell({ table }: { table: ShellTable }) {
  return (
    <figure className="space-y-2">
      <figcaption className="text-sm font-semibold">
        Table {table.number}. {table.title}
      </figcaption>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr>
              {table.columns.map((column) => (
                <th
                  key={column}
                  className="border border-line px-2 py-1.5 text-left font-semibold"
                >
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row, i) => (
              <tr key={`${row.label}-${i}`}>
                <td className="border border-line px-2 py-1.5 align-top">
                  <Label text={row.label} />
                </td>
                {/* Every cell after the first is blank, and stays blank. */}
                {table.columns.slice(1).map((column) => (
                  <td key={column} className="border border-line px-2 py-1.5">
                    &nbsp;
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs italic text-muted">
        Footnote: test used = {table.footnote.replace(/\*\*TODO:\*\*/g, "TODO:")}
      </p>
    </figure>
  );
}

export function SapDocument({ build }: { build: SapBuild }) {
  const { facts, picot, objectives, analysis, tables, figures, rules, pinned } =
    build;

  return (
    <article className="card space-y-8 p-6">
      <header className="space-y-1">
        <h1 className="text-center text-base font-bold uppercase tracking-wide">
          Statistical Analysis Plan
        </h1>
        <p className="text-center text-sm font-semibold">{facts.title}</p>
      </header>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">{picot.frame}</h2>
        <p className="text-xs italic text-muted">
          The clinical question decomposed. This is what every objective,
          variable and test below must trace back to.
        </p>
        <p className="text-sm">
          <strong>Assembled question:</strong>{" "}
          <em>{picot.assembled_question}</em>
        </p>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-xs">
            <tbody>
              {picot.rows.map((row) => (
                <tr key={row.letter}>
                  <td className="w-8 border border-line px-2 py-1.5 font-semibold">
                    {row.letter}
                  </td>
                  <td className="w-40 border border-line px-2 py-1.5">
                    {row.element}
                  </td>
                  <td className="border border-line px-2 py-1.5">{row.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">
          Section 1. Objectives as Answerable Questions
        </h2>
        <p className="text-xs italic text-muted">
          Every objective is phrased as a question. A question forces you to name
          an outcome and a predictor, which is exactly what the statistics need.
        </p>
        <div className="space-y-1">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">
            Aim
          </h3>
          <p className="text-sm">{picot.aim}</p>
        </div>
        <div className="space-y-1">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">
            Hypothesis
          </h3>
          <p className="text-sm">{picot.hypothesis}</p>
        </div>
        {(["primary", "secondary", "exploratory"] as const).map((family) => {
          const mine = objectives.filter((o) => o.family === family);
          if (!mine.length) return null;
          return (
            <div key={family} className="space-y-1">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">
                {family} objectives
              </h3>
              <ul className="space-y-1 text-sm">
                {mine.map((o) => (
                  <li key={o.id}>
                    <strong>{o.id}.</strong> {o.question}
                    {o.source === "hypothesis" && (
                      <span className="text-muted">
                        {" "}
                        (stated in the hypothesis, not as a formal objective)
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Analysis Map</h2>
        <p className="text-xs italic text-muted">
          One row per objective, the heart of the plan. Every question is linked
          to its test and to the empty results table it will fill.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr>
                {["Objective", "Outcome", "Predictors", "Data type", "Test → Table"].map(
                  (heading) => (
                    <th
                      key={heading}
                      className="border border-line px-2 py-1.5 text-left font-semibold"
                    >
                      {heading}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {analysis.map((row) => (
                <tr key={row.objective}>
                  <td className="border border-line px-2 py-1.5 align-top font-semibold">
                    {row.objective}
                  </td>
                  {/*
                    The label, not the name. A variable is named for code -
                    `amputation_primary_or_secondary_of_the_injured_extremity_within_30_days_of_injury` -
                    and printed raw it is unreadable and, having no spaces, it
                    forces the column as wide as itself and leaves every other
                    row a tall empty box.
                  */}
                  <td className="border border-line px-2 py-1.5 align-top break-words">
                    {labelOf(build, row.outcome)}
                  </td>
                  <td className="border border-line px-2 py-1.5 align-top break-words">
                    {row.predictors.map((name) => labelOf(build, name)).join(", ") ||
                      "none"}
                  </td>
                  <td className="border border-line px-2 py-1.5 align-top">
                    {row.data_type}, {row.count}
                  </td>
                  <td className="border border-line px-2 py-1.5 align-top break-words">
                    {row.unadjusted && (
                      <div>
                        Unadjusted: {row.unadjusted.test} → T{row.unadjusted.table}
                      </div>
                    )}
                    {row.adjusted && (
                      <div>
                        Adjusted: {row.adjusted.model}
                        {row.adjusted.covariates.length
                          ? ` + ${row.adjusted.covariates
                              .map((c) => labelOf(build, c.var))
                              .join(", ")}`
                          : ""}{" "}
                        → T{row.adjusted.table}
                        {row.adjusted.fit_table ? ` (fit T${row.adjusted.fit_table})` : ""}
                      </div>
                    )}
                    {row.exception === "safety" && (
                      <div>Safety outcome: reported, not modelled.</div>
                    )}
                    {row.exception === "estimation" && (
                      <div>Estimation objective: interval, no p value.</div>
                    )}
                    {row.exception === "diagnostic" && <div>{DIAGNOSTIC_NOTE}</div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-sm font-semibold">Section 6. Shell (Dummy) Tables</h2>
        <p className="text-xs italic text-muted">
          Every empty results table the thesis will contain, in the exact order
          it will appear. Cells stay blank and no number is ever invented. Each
          table names the test that produced it.
        </p>
        <p className="text-sm">
          This plan contains {pinned.tables} numbered tables (T1 to T
          {pinned.tables}), {pinned.fits} fit {pinned.fits === 1 ? "table" : "tables"} and{" "}
          {pinned.figures} {pinned.figures === 1 ? "figure" : "figures"}. These
          numbers are the contract with the results chapter.
        </p>

        <div className="space-y-1 rounded-lg bg-background p-3 text-xs italic text-muted">
          <p>Software: {rules.software.replace(/\*\*TODO:\*\*/g, "TODO:")}</p>
          <p>
            Significance: alpha of {rules.alpha}, {rules.sided}-sided, with{" "}
            {rules.ci_level} confidence intervals.
          </p>
          <p>{rules.summaries}</p>
          <p>{rules.normality}</p>
          <p>Missing data: {rules.missing_data}</p>
          <p>Interim analysis: {rules.interim}</p>
        </div>

        <div className="space-y-1">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">
            Analysis populations
          </h3>
          <ul className="space-y-1 text-sm">
            {rules.populations.map((p) => (
              <li key={p.name}>
                <strong>{p.name}.</strong>{" "}
                <Label text={p.definition} />
              </li>
            ))}
          </ul>
        </div>

        {BLOCKS.map(({ key, heading }) => {
          const mine = tables.filter((t) => t.block === key);
          if (!mine.length) return null;
          const note = rules.multiplicity[key as keyof typeof rules.multiplicity];
          return (
            <div key={key} className="space-y-4">
              <h3 className="text-sm font-semibold">{heading}</h3>
              {key === "primary" && (
                <p className="text-xs italic text-muted">{rules.population_line}</p>
              )}
              {note && (
                <p className="text-xs italic text-muted">Multiplicity: {note}</p>
              )}
              {key === "secondary" && rules.multiplicity.safety && (
                <p className="text-xs italic text-muted">
                  Safety: {rules.multiplicity.safety}
                </p>
              )}
              {mine.map((table) => (
                <div key={table.number} className="space-y-4">
                  <Shell table={table} />
                  {figures
                    .filter((f) => f.after === table.number)
                    .map((figure) => (
                      <figure key={figure.number} className="space-y-1">
                        <figcaption className="text-sm font-semibold">
                          Figure {figure.number}. {figure.caption}
                        </figcaption>
                        <p className="text-xs italic text-muted">
                          Footnote: {figure.footnote}
                        </p>
                      </figure>
                    ))}
                </div>
              ))}
            </div>
          );
        })}
      </section>
    </article>
  );
}
