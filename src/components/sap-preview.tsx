import { chooseTest } from "@/lib/sap/choose-test";
import { PICOT_COLUMNS, PICOT_HEADING, picotRows } from "@/lib/sap/picot";
import {
  VARIABLE_LIST_COLUMNS,
  VARIABLE_LIST_HEADING,
  variableListRows,
} from "@/lib/sap/variable-list";
import {
  analysisCell,
  dataTypeCell,
  planKey,
  predictorCell,
  tableCell,
} from "@/lib/render/analysis-cells";
import {
  outcomeCell,
  outcomeIndex,
  variableIndex,
  type SapSpec,
} from "@/lib/sap/types";
import { line, plain } from "@/lib/render/plain";
import {
  DocHeading,
  DocSection,
  DocTable,
  DocumentShell,
  Labelled,
  Note,
  Td,
} from "./document-shell";
import { ShellTableSection } from "./tables-preview";
import type { ShellTablesSpec } from "@/lib/tables/types";

/**
 * The Statistical Analysis Plan, on screen.
 *
 * Mirrors sap-docx.ts section for section: the two sections the format asks
 * for, then the notes under the map. What is read here is what the .docx
 * contains, so a supervisor can check the plan without opening Word.
 */

const HEADERS = ["Objective", "Outcome", "Predictor(s)", "Data type", "Statistical test"];

export function SapPreview({
  spec,
  tableNumbers,
  shells,
}: {
  spec: SapSpec;
  /** The shell tables, drawn as Section 6. Absent until they are built. */
  shells?: ShellTablesSpec | null;
  /**
   * Objective id to the table that reports it, from the shell tables. The plan's
   * own table_id is provisional: it was written before anyone knew how many
   * baseline tables the study needed.
   */
  tableNumbers?: Record<string, number[]>;
}) {
  const byVariable = variableIndex(spec);
  const byOutcome = outcomeIndex(spec);

  // A stored plan is whatever was written to the row, not whatever the current
  // type says. A preview that throws takes the whole page down with it.
  const objectives = spec.objectives ?? [];
  const analyses = spec.analyses ?? [];
  const variables = spec.variables ?? [];

  const primary = objectives.filter((o) => o.tier === "primary");
  const secondary = objectives.filter((o) => o.tier === "secondary");
  const exploratory = objectives.filter((o) => o.tier === "exploratory");

  // Grouped by test, because that is how the checks are read: you look up the
  // test you are about to run.
  const checksByTest = new Map<string, NonNullable<typeof spec.assumption_checks>>();
  for (const check of spec.assumption_checks ?? []) {
    const list = checksByTest.get(check.test) ?? [];
    list.push(check);
    checksByTest.set(check.test, list);
  }

  // The test is derived here exactly as the renderer derives it, so the screen
  // cannot show a different test from the download.
  const reasons = new Map<string, string>();
  const avoided = new Map<string, string>();

  const rows = analyses.map((row) => {
    const plan = chooseTest(row);
    if (plan) {
      reasons.set(planKey(plan), plan.why);
      if (plan.avoid) avoided.set(planKey(plan), plan.avoid);
    }
    const where = tableCell(row, tableNumbers);

    return {
      label: row.label,
      outcome: (row.outcome_ids ?? [])
        .map((id) => {
          const outcome = byOutcome.get(id);
          return outcome ? outcomeCell(outcome) : `UNKNOWN OUTCOME ${id}`;
        })
        .join("; "),
      predictors: predictorCell(row, byVariable),
      dataType: dataTypeCell(row),
      analysis: plan
        ? `${analysisCell(plan, row)} -> ${where}`
        : `NO RULE COVERS THIS ROW. Decide the analysis and record it. -> ${where}`,
      covered: Boolean(plan),
    };
  });

  return (
    <DocumentShell kind="Statistical Analysis Plan" title={plain(spec.title)}>
      {spec.picot && (
        <DocSection title={PICOT_HEADING}>
          <Note>
            The clinical question decomposed. This is what every objective, variable and test
            below must trace back to.
          </Note>
          <DocTable headers={PICOT_COLUMNS}>
            {picotRows(spec.picot).map(([letter, element, value]) => (
              <tr key={letter}>
                <Td bold>{letter}</Td>
                <Td bold>{element}</Td>
                <Td>{plain(value)}</Td>
              </tr>
            ))}
          </DocTable>
          <Labelled label="Assembled question:">{plain(spec.picot.assembled_question)}</Labelled>
        </DocSection>
      )}

      <DocSection title="Section 1 - Objectives as Answerable Questions">
        <DocHeading>Aim</DocHeading>
        <p className="text-sm leading-relaxed">{plain(spec.aim)}</p>

        {spec.hypothesis && (
          <>
            <DocHeading>Hypothesis</DocHeading>
            <p className="text-sm leading-relaxed">{plain(spec.hypothesis)}</p>
          </>
        )}

        <DocHeading>Primary objective(s)</DocHeading>
        <ObjectiveList items={primary} />

        {secondary.length > 0 && (
          <>
            <DocHeading>Secondary objectives</DocHeading>
            <ObjectiveList items={secondary} />
          </>
        )}
        {exploratory.length > 0 && (
          <>
            <DocHeading>Exploratory objectives</DocHeading>
            <ObjectiveList items={exploratory} />
          </>
        )}
      </DocSection>

      <DocSection title="Analysis Map">
        <DocTable headers={HEADERS}>
          {rows.map((row, i) => (
            <tr key={i}>
              <Td bold>{line(row.label)}</Td>
              <Td>{line(row.outcome)}</Td>
              <Td>{line(row.predictors)}</Td>
              <Td>{line(row.dataType)}</Td>
              <Td>
                <span className={row.covered ? "" : "text-danger font-semibold"}>
                  {line(row.analysis)}
                </span>
              </Td>
            </tr>
          ))}
        </DocTable>

      </DocSection>

      {variables.length > 0 && (
        <DocSection title={VARIABLE_LIST_HEADING}>
          <DocTable headers={VARIABLE_LIST_COLUMNS}>
            {variableListRows(spec).map((row, i) => (
              <tr key={i}>
                <Td bold>{plain(row[0])}</Td>
                {row.slice(1).map((cell, c) => (
                  <Td key={c}>{plain(cell)}</Td>
                ))}
              </tr>
            ))}
          </DocTable>
        </DocSection>
      )}

      <DocSection title="Section 6 - Shell (Dummy) Tables">
        {/* Drawn here, not pointed at. This said the tables were in a separate
            document, and that document no longer exists: they are part of the
            plan. What is on screen is what the download contains. */}
        {shells?.tables?.length ? (
          <div className="mt-4">
            <ShellTableSection spec={shells} />
          </div>
        ) : (
          <p className="mt-2 text-xs leading-relaxed text-muted">
            The tables have not been built yet. Build the plan again and this section fills in:
            the plan is written first, and the tables are laid out from it.
          </p>
        )}
      </DocSection>

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
            <span className="font-semibold">{o.id}. </span>
            {plain(o.question)}
          </span>
        </li>
      ))}
    </ul>
  );
}
