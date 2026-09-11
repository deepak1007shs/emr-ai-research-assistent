import type {
  ExploratoryOutcome,
  FactsSheet,
  Objective,
  Variable,
} from "../study/types.ts";

/**
 * Step 3: what each exploratory question is actually about.
 *
 * Two things happen here and nothing else. Each question is linked to the
 * variables it reuses, and where it names one the study does not collect, that
 * variable is promoted onto the form with the reason recorded.
 *
 * Promotion is the point. A protocol that asks in its hypothesis whether the
 * effect differs by dietary pattern, and collects dietary pattern nowhere, has
 * lost that analysis before the first participant is enrolled, and nothing in
 * the finished document would have shown it. The reason is stored beside the
 * promotion so the investigator can refuse it.
 */

export type Exploratory = {
  outcomes: ExploratoryOutcome[];
  todos: string[];
};

export function buildExploratory(
  facts: FactsSheet,
  objectives: Objective[],
  variables: Variable[],
): Exploratory {
  const byName = new Map(variables.map((v) => [v.name, v]));
  const collected = new Set(
    facts.visit_schedule.flatMap((visit) => visit.measures),
  );
  const exploratoryObjectives = objectives.filter(
    (o) => o.family === "exploratory",
  );

  const outcomes: ExploratoryOutcome[] = [];
  const todos: string[] = [];

  facts.exploratory_ideas.forEach((idea, index) => {
    const objective = exploratoryObjectives[index];
    if (!objective) return;

    const reuses = [idea.outcome_of, ...idea.with];
    let promoted: ExploratoryOutcome["promoted"] = null;

    for (const name of idea.with) {
      const variable = byName.get(name);
      if (!variable) continue;

      // Named by the question and taken at no visit: the study asks about
      // something it never writes down.
      if (!collected.has(name) && variable.derived_from.length === 0) {
        variable.source = "promoted";
        variable.timepoints = [facts.timepoints[0] ?? ""].filter(Boolean);
        variable.crf = true;
        const reason = `Named by ${objective.id} and recorded at no visit of the protocol's schedule.`;
        promoted = { variable: name, reason };
        todos.push(
          `${variable.label} is added to the form at ${variable.timepoints[0] || "enrolment"} so that ${objective.id} can be answered. The protocol asks the question and collects nothing to answer it. Confirm the categories, or drop the question.`,
        );
      }
    }

    outcomes.push({
      id: objective.id,
      question: objective.question,
      kind: idea.kind,
      reuses,
      promoted,
    });
  });

  return { outcomes, todos };
}
