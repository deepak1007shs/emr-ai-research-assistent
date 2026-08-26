import { chooseTest, degreesOfFreedomNote } from "@/lib/sap/choose-test";
import { outcomeCell, outcomeIndex, variableIndex, type SapSpec } from "@/lib/sap/types";
import { line, plain } from "@/lib/render/plain";
import { DocHeading, DocSection, DocTable, DocumentShell, Note, Td } from "./document-shell";

/**
 * The Statistical Analysis Plan, on screen.
 *
 * Mirrors sap-docx.ts section for section: the two sections the format asks
 * for, then the notes under the map. What is read here is what the .docx
 * contains, so a supervisor can check the plan without opening Word.
 */

const HEADERS = ["Objective", "Outcome", "Predictor(s)", "Data type", "Statistical test -> Table #"];

export function SapPreview({ spec }: { spec: SapSpec }) {
  const byVariable = variableIndex(spec);
  const byOutcome = outcomeIndex(spec);

  // A stored plan is whatever was written to the row, not whatever the current
  // type says. A preview that throws takes the whole page down with it.
  const objectives = spec.objectives ?? [];
  const analyses = spec.analyses ?? [];
  const variables = spec.variables ?? [];

  const primary = objectives.filter((o) => o.tier === "primary");
  const secondary = objectives.filter((o) => o.tier === "secondary");

  // The test is derived here exactly as the renderer derives it, so the screen
  // cannot show a different test from the download.
  const reasons = new Map<string, string>();
  const rows = analyses.map((row) => {
    const chosen = chooseTest(row);
    if (chosen) reasons.set(chosen.test, chosen.why);
    const outcome = byOutcome.get(row.outcome_id);

    return {
      label: row.label,
      outcome: outcome ? outcomeCell(outcome) : `UNKNOWN OUTCOME ${row.outcome_id}`,
      predictors:
        (row.predictor_ids ?? []).map((id) => byVariable.get(id)?.label ?? id).join(", ") ||
        "(single-group estimate)",
      dataType: row.data_type,
      test: chosen
        ? `${chosen.test} -> ${row.table_id}`
        : `NO RULE COVERS THIS ROW. Decide the test and record it. -> ${row.table_id}`,
      covered: Boolean(chosen),
    };
  });

  const adjusted = analyses.find((a) => a.comparison === "adjusted");
  const dfNote =
    spec.expected_events !== undefined && adjusted
      ? degreesOfFreedomNote(spec.expected_events, (adjusted.predictor_ids ?? []).length).note
      : null;

  const excluded = variables.filter(
    (v) => (v.role === "mediator" || v.role === "collider") && v.exclusion_reason,
  );

  return (
    <DocumentShell kind="Statistical Analysis Plan" title={plain(spec.title)}>
      <DocSection title="Section 1 - Objectives as Answerable Questions">
        <DocHeading>Aim</DocHeading>
        <p className="text-sm leading-relaxed">{plain(spec.aim)}</p>

        <DocHeading>Primary objective(s)</DocHeading>
        <ObjectiveList items={primary} />

        {secondary.length > 0 && (
          <>
            <DocHeading>Secondary objectives</DocHeading>
            <ObjectiveList items={secondary} />
          </>
        )}
      </DocSection>

      <DocSection title="Section 2 - Analysis Map">
        <Note>
          One row per objective. Every question is linked to its test AND to the empty results
          table it will fill.
        </Note>
        <DocTable headers={HEADERS}>
          {rows.map((row, i) => (
            <tr key={i}>
              <Td bold>{line(row.label)}</Td>
              <Td>{line(row.outcome)}</Td>
              <Td>{line(row.predictors)}</Td>
              <Td>{row.dataType}</Td>
              <Td>
                <span className={row.covered ? "" : "text-danger font-semibold"}>
                  {line(row.test)}
                </span>
              </Td>
            </tr>
          ))}
        </DocTable>

        {reasons.size > 0 && (
          <div className="space-y-1.5">
            <DocHeading>Why each test</DocHeading>
            {[...reasons].map(([test, why]) => (
              <p key={test} className="text-xs leading-relaxed">
                <span className="font-semibold">{test}:</span> {plain(why)}.
              </p>
            ))}
          </div>
        )}

        {dfNote && (
          <div className="space-y-1.5">
            <DocHeading>Degrees of freedom</DocHeading>
            <p className="text-xs leading-relaxed">{plain(dfNote)}</p>
          </div>
        )}

        {excluded.length > 0 && (
          <div className="space-y-1.5">
            <DocHeading>Not adjusted for</DocHeading>
            {excluded.map((v) => (
              <p key={v.id} className="text-xs leading-relaxed">
                {plain(`${v.label} is a ${v.role}. ${v.exclusion_reason}`)}
              </p>
            ))}
            <p className="text-xs leading-relaxed">Neither enters any model.</p>
          </div>
        )}
      </DocSection>

      <Note>
        Generated from the study specification. Do not edit this document: change the specification
        and rebuild, or the analysis plan, the case record form and the shell tables will disagree.
      </Note>
    </DocumentShell>
  );
}

function ObjectiveList({ items }: { items: SapSpec["objectives"] }) {
  return (
    <ul className="space-y-1.5">
      {items.map((o) => (
        <li key={o.id} className="flex gap-2 text-sm leading-relaxed">
          <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-accent" />
          <span>
            <span className="font-semibold">{o.id}: </span>
            {plain(o.question)}
          </span>
        </li>
      ))}
    </ul>
  );
}
