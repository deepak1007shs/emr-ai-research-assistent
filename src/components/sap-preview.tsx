import { chooseTest, degreesOfFreedomNote } from "@/lib/sap/choose-test";
import {
  analysisCell,
  dataTypeCell,
  planKey,
  predictorCell,
  tableCell,
} from "@/lib/render/analysis-cells";
import {
  outcomeCell,
  outcomeDefinition,
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
  FactTable,
  Labelled,
  Note,
  Td,
} from "./document-shell";

/**
 * The Statistical Analysis Plan, on screen.
 *
 * Mirrors sap-docx.ts section for section: the two sections the format asks
 * for, then the notes under the map. What is read here is what the .docx
 * contains, so a supervisor can check the plan without opening Word.
 */

const HEADERS = ["Objective", "Outcome", "Predictor(s)", "Data type", "Statistical analysis -> Table #"];

export function SapPreview({
  spec,
  tableNumbers,
}: {
  spec: SapSpec;
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

  const ROLE_ORDER: Record<string, number> = {
    outcome: 0, predictor: 1, effect_modifier: 2, confounder: 3,
    mediator: 4, collider: 5, descriptor: 6,
  };
  const byRole = [...variables].sort(
    (a, b) => (ROLE_ORDER[a.role] ?? 9) - (ROLE_ORDER[b.role] ?? 9),
  );

  const fw = spec.picot?.framework === "PICOT" ? "PICOT" : "PECOT";

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

  const adjusted = analyses.find((a) => (a.adjust_for_ids ?? []).length > 0);
  const dfNote =
    spec.expected_events !== undefined && adjusted
      ? degreesOfFreedomNote(spec.expected_events, (adjusted.adjust_for_ids ?? []).length).note
      : null;

  // The five questions in full, under the map rather than inside its cells.
  const measured = (spec.outcomes ?? []).filter((o) =>
    analyses.some((a) => (a.outcome_ids ?? []).includes(o.id)),
  );

  const excluded = variables.filter(
    (v) => (v.role === "mediator" || v.role === "collider") && v.exclusion_reason,
  );

  return (
    <DocumentShell kind="Statistical Analysis Plan" title={plain(spec.title)}>
      <p className="-mt-3 text-center text-xs text-muted italic">
        {plain(`${spec.design}. ${spec.setting ?? ""}`)}
      </p>

      {spec.picot && (
        <DocSection title={fw}>
          <Note>
            The clinical question decomposed. This is what every objective, variable and test
            below must trace back to.
          </Note>
          <FactTable
            rows={[
              ["P - Population", plain(spec.picot.population)],
              [
                fw === "PICOT" ? "I - Intervention" : "E - Exposure",
                plain(spec.picot.intervention_or_exposure),
              ],
              ["C - Comparator", plain(spec.picot.comparator)],
              ["O - Outcome", plain(spec.picot.outcome)],
              ["T - Time / type of study", plain(spec.picot.time)],
            ]}
          />
          <Labelled label="Assembled question.">{plain(spec.picot.assembled_question)}</Labelled>
        </DocSection>
      )}

      <DocSection title="Section 1 - Objectives as Answerable Questions">
        <Note>
          Every objective is phrased as a question, because a question forces you to name an
          outcome and a predictor, which is exactly what the statistics need.
        </Note>

        <DocHeading>Aim</DocHeading>
        <p className="text-sm leading-relaxed">{plain(spec.aim)}</p>

        {spec.hypothesis && (
          <>
            <DocHeading>Hypothesis</DocHeading>
            <p className="text-sm leading-relaxed">{plain(spec.hypothesis)}</p>
          </>
        )}

        {spec.estimand && (
          <>
            <DocHeading>Primary estimand (ICH E9(R1))</DocHeading>
            <Note>The estimand, not the test, is what the study is trying to estimate.</Note>
            <FactTable
              rows={[
                ["Treatment condition", plain(spec.estimand.treatment_condition)],
                ["Population", plain(spec.estimand.population)],
                ["Endpoint", plain(spec.estimand.endpoint)],
                ["Intercurrent-event strategy", plain(spec.estimand.intercurrent_strategy)],
                ["Population-level summary", plain(spec.estimand.summary_measure)],
              ]}
            />
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
            <DocHeading>Exploratory objectives (hypothesis-generating, not powered)</DocHeading>
            <ObjectiveList items={exploratory} />
          </>
        )}
      </DocSection>

      <DocSection title="Section 2 - Variable Table">
        <Note>
          One row per variable. Once the data type and the role are set, the correct test follows
          almost mechanically. Grouped by role: outcomes first, then predictors, then confounders,
          then descriptors.
        </Note>
        <DocTable headers={["Variable", "Data type", "Unit / coding", "Role in analysis"]}>
          {byRole.map((v) => (
            <tr key={v.id}>
              <Td bold>{plain(v.label)}</Td>
              <Td>{v.data_type}</Td>
              <Td>{plain(v.unit_coding)}</Td>
              <Td>{v.role.replace(/_/g, " ")}</Td>
            </tr>
          ))}
        </DocTable>
        {spec.priority_confounder_ids?.length > 0 && (
          <Labelled label="Priority confounders for adjustment.">
            {spec.priority_confounder_ids
              .map((id) => byVariable.get(id)?.label ?? id)
              .join(", ")}
            . Respecting about ten outcome events per variable.
          </Labelled>
        )}
      </DocSection>

      <DocSection title="Section 3 - Analysis Map">
        <Note>
          One row per objective, or per group of objectives that share an analysis. Every question is linked to its analysis, unadjusted and adjusted, AND to the empty results tables it will fill.
        </Note>
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

        {measured.length > 0 && (
          <div className="space-y-1.5">
            <DocHeading>How each outcome is defined</DocHeading>
            {measured.map((outcome) => (
              <p key={outcome.id} className="text-xs leading-relaxed">
                <span className="font-semibold">{plain(outcome.what)}.</span>{" "}
                {plain(outcomeDefinition(outcome))}
              </p>
            ))}
          </div>
        )}

        {reasons.size > 0 && (
          <div className="space-y-1.5">
            <DocHeading>Why each analysis</DocHeading>
            {[...reasons].map(([test, why]) => (
              <p key={test} className="text-xs leading-relaxed">
                <span className="font-semibold">{test}:</span> {plain(why)}.
              </p>
            ))}
          </div>
        )}

        {avoided.size > 0 && (
          <div className="space-y-1.5">
            <DocHeading>What must not be done</DocHeading>
            {[...avoided].map(([test, avoid]) => (
              <p key={test} className="text-xs leading-relaxed">
                <span className="font-semibold">{test}:</span> {plain(avoid)}.
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

      {spec.rules && (
        <DocSection title="Section 4 - General Statistical Rules">
          <Note>Fixed upfront so they are never re-decided after seeing the data.</Note>
          <Labelled label="Software.">{plain(spec.rules.software)}</Labelled>
          <Labelled label="Normality.">{plain(spec.rules.normality)}</Labelled>
          <Labelled label="Continuous data.">{plain(spec.rules.continuous_summary)}</Labelled>
          <Labelled label="Categorical data.">{plain(spec.rules.categorical_summary)}</Labelled>
          <Labelled label="Significance.">{plain(spec.rules.significance)}</Labelled>
          <Labelled label="Effect estimates.">{plain(spec.rules.effect_estimates)}</Labelled>
          <Labelled label="Missing data.">{plain(spec.rules.missing_data)}</Labelled>
          <Labelled label="Multiplicity.">{plain(spec.rules.multiplicity)}</Labelled>
          <Labelled label="Reproducibility.">{plain(spec.rules.reproducibility)}</Labelled>
          {spec.sample_size_note && (
            <Labelled label="Sample size.">{plain(spec.sample_size_note)}</Labelled>
          )}

          {spec.populations?.length > 0 && (
            <>
              <DocHeading>Analysis populations (who is analysed)</DocHeading>
              <DocTable headers={["Population", "Definition"]}>
                {spec.populations.map((p, i) => (
                  <tr key={i}>
                    <Td bold>{plain(p.name)}</Td>
                    <Td>{plain(p.definition)}</Td>
                  </tr>
                ))}
              </DocTable>
            </>
          )}

          {spec.baseline_comparison && (
            <>
              <DocHeading>Baseline comparison</DocHeading>
              <p className="text-xs leading-relaxed">{plain(spec.baseline_comparison)}</p>
            </>
          )}

          {spec.intercurrent_events?.length > 0 && (
            <>
              <DocHeading>Intercurrent events</DocHeading>
              <Note>
                These change what is being estimated. Missing data is a separate problem, handled
                by the rule above.
              </Note>
              <DocTable headers={["Event", "Strategy"]}>
                {spec.intercurrent_events.map((e, i) => (
                  <tr key={i}>
                    <Td bold>{plain(e.event)}</Td>
                    <Td>{plain(e.strategy)}</Td>
                  </tr>
                ))}
              </DocTable>
            </>
          )}

          {spec.testing_hierarchy && (
            <>
              <DocHeading>Multiplicity and testing hierarchy</DocHeading>
              <p className="text-xs leading-relaxed">{plain(spec.testing_hierarchy)}</p>
            </>
          )}

          {spec.subgroups?.length > 0 && (
            <>
              <DocHeading>Subgroup and interaction analyses</DocHeading>
              <Note>
                Pre-specified. Effect modification is tested by an interaction term, never by
                comparing within-subgroup p values.
              </Note>
              <DocTable headers={["Subgroup", "How it is tested"]}>
                {spec.subgroups.map((g, i) => (
                  <tr key={i}>
                    <Td bold>{plain(g.subgroup)}</Td>
                    <Td>{plain(g.how_tested)}</Td>
                  </tr>
                ))}
              </DocTable>
            </>
          )}

          {spec.interim && (
            <>
              <DocHeading>Interim analyses and stopping rules</DocHeading>
              <p className="text-xs leading-relaxed">{plain(spec.interim)}</p>
            </>
          )}
        </DocSection>
      )}

      {spec.steps?.length > 0 && (
        <DocSection title="Section 5 - Step-by-Step Analysis Flow">
          <Note>
            The ladder for the primary objective. The same ladder works for almost any design.
          </Note>
          {spec.steps.map((step, i) => (
            <Labelled key={i} label={`${plain(step.step)}.`}>
              {plain(step.what)}
            </Labelled>
          ))}
        </DocSection>
      )}

      {checksByTest.size > 0 && (
        <DocSection title="Section 5A - Assumption Checking">
          <Note>
            The assumptions belong to the test that was chosen, so only the assumptions the
            planned tests actually make are listed. For each: how it will be checked, what to do
            if it is violated, and an example in this study&apos;s own terms.
          </Note>
          {[...checksByTest].map(([test, checks]) => (
            <div key={test} className="space-y-2">
              <DocHeading>{plain(test)}</DocHeading>
              <DocTable
                headers={["Assumption", "How it will be checked", "If violated", "Clinical example"]}
              >
                {checks.map((c, i) => (
                  <tr key={i}>
                    <Td bold>{plain(c.assumption)}</Td>
                    <Td>{plain(c.how_checked)}</Td>
                    <Td>{plain(c.if_violated)}</Td>
                    <Td>{plain(c.example)}</Td>
                  </tr>
                ))}
              </DocTable>
            </div>
          ))}
        </DocSection>
      )}

      <DocSection title="Section 6 - Shell (Dummy) Tables">
        <p className="text-xs leading-relaxed">
          Every empty results table the thesis will contain, in the order it will appear, is laid
          out in the Shell Tables document that accompanies this plan. Cells stay blank until the
          data arrive, and each table names the test that produced it.
        </p>
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
