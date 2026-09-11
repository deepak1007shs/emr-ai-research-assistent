import { buildAnalysis } from "../analysis/build.ts";
import { step4Checks } from "../analysis/checks.ts";
import { gateA } from "../facts/gate.ts";
import { buildObjectives, buildPicot } from "../objectives/build.ts";
import { step1Checks } from "../objectives/checks.ts";
import { buildRules } from "../rules/build.ts";
import { step5Checks } from "../rules/checks.ts";
import { buildTables, numberTheMap } from "../tables/build.ts";
import { step6Checks } from "../tables/checks.ts";
import { gateB } from "../checks/step7.ts";
import { buildVariables } from "../variables/build.ts";
import { step2Checks, step3Checks } from "../variables/checks.ts";
import { buildExploratory } from "../variables/exploratory.ts";
import type {
  AnalysisRow,
  CheckResult,
  ExploratoryOutcome,
  FactsSheet,
  Objective,
  Picot,
  Rules,
  ShellTable,
  Variable,
} from "../study/types.ts";

/**
 * The whole plan, built from the Facts Sheet and nothing else.
 *
 * One function, eight steps, no model call. Run it twice on the same facts and
 * the two results are identical, which is the rebuild's own acceptance test and
 * the thing the old six-call build could not do.
 *
 * The checks run beside the steps rather than after them, because a check is
 * only useful where it can name the object that failed, and the objects are
 * here.
 */

export type Pinned = { tables: number; fits: number; figures: number };

export type SapBuild = {
  facts: FactsSheet;
  picot: Picot;
  objectives: Objective[];
  variables: Variable[];
  exploratory: ExploratoryOutcome[];
  analysis: AnalysisRow[];
  rules: Rules;
  tables: ShellTable[];
  figures: { number: string; block: string; caption: string; footnote: string }[];
  pinned: Pinned;
  checks: CheckResult[];
  /** Everything waiting for the investigator, deduplicated, in build order. */
  todos: string[];
};

export function buildSap(facts: FactsSheet): SapBuild {
  const todos: string[] = [...facts.open_items];
  const checks: CheckResult[] = [...gateA(facts)];

  const picot = buildPicot(facts);
  const objectives = buildObjectives(facts);
  checks.push(...step1Checks(facts, picot, objectives));

  const built = buildVariables(facts, objectives);
  const variables = built.variables;
  todos.push(...built.todos);
  checks.push(...step2Checks(facts, objectives, variables));

  const explored = buildExploratory(facts, objectives, variables);
  todos.push(...explored.todos);
  checks.push(...step3Checks(variables, explored.outcomes));

  const analysed = buildAnalysis(facts, objectives, variables, explored.outcomes);
  todos.push(...analysed.todos);
  checks.push(...step4Checks(facts, objectives, analysed.rows));

  const ruled = buildRules(facts, objectives, analysed.rows);
  todos.push(...ruled.todos);
  checks.push(...step5Checks(objectives, ruled.rules));

  const drawn = buildTables(
    facts,
    objectives,
    variables,
    analysed.rows,
    explored.outcomes,
    ruled.rules,
  );
  todos.push(...drawn.todos);

  // The numbers in the map were provisional until now (rule 4.12).
  const analysis = numberTheMap(analysed.rows, drawn.tables);

  const numbered = drawn.tables.filter((t) => !t.fit_table_of);
  const pinned: Pinned = {
    tables: numbered.length,
    fits: drawn.tables.length - numbered.length,
    figures: drawn.figures.length,
  };
  checks.push(...step6Checks(facts, drawn.tables, drawn.figures, pinned));

  checks.push(
    ...gateB({
      facts,
      objectives,
      variables,
      analysis,
      exploratory: explored.outcomes,
      tables: drawn.tables,
      figures: drawn.figures,
      rules: ruled.rules,
      pinned,
    }),
  );

  return {
    facts,
    picot,
    objectives,
    variables,
    exploratory: explored.outcomes,
    analysis,
    rules: ruled.rules,
    tables: drawn.tables,
    figures: drawn.figures,
    pinned,
    checks,
    todos: [...new Set(todos)],
  };
}

/** The checks that stop the document being rendered, if any. */
export const blockers = (build: SapBuild) => build.checks.filter((c) => !c.pass);
