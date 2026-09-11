import type {
  AnalysisRow,
  CheckResult,
  ExploratoryOutcome,
  FactsSheet,
  Objective,
  Rules,
  ShellTable,
  Variable,
} from "../study/types.ts";
import { promisesIn } from "../objectives/promises.ts";
import { isRepeated } from "../objectives/build.ts";
import { STUDY } from "../variables/build.ts";

/**
 * Gate B: the eleven traceability checks, run over the finished objects.
 *
 * Every one is a set or graph operation. None calls a model, which is what the
 * written process asks for and what lets the whole gate run in a test with no
 * API key and give the same answer twice.
 *
 * What they are all looking for is the same thing from different directions: a
 * question with no table, a table with no question, a variable collected for
 * nothing, a variable used by something and collected by nobody. All four read
 * as a finished document.
 */

const ok = (id: string, message: string): CheckResult => ({
  id,
  pass: true,
  failing: [],
  message,
});

export type GateBInput = {
  facts: FactsSheet;
  objectives: Objective[];
  variables: Variable[];
  analysis: AnalysisRow[];
  exploratory: ExploratoryOutcome[];
  tables: ShellTable[];
  figures: { number: string }[];
  rules: Rules;
  pinned: { tables: number; fits: number; figures: number };
};

export function gateB(input: GateBInput): CheckResult[] {
  const { facts, objectives, variables, analysis, exploratory, tables, rules } =
    input;
  const results: CheckResult[] = [];
  const numbered = tables.filter((t) => !t.fit_table_of);
  const byName = new Map(variables.map((v) => [v.name, v]));

  /* S7-1 forward: every objective reaches a table. */
  const unanswered = objectives.filter(
    (o) => !tables.some((t) => t.fills.includes(o.id)),
  );
  results.push(
    unanswered.length === 0
      ? ok("S7-1", "Every objective points at a table.")
      : {
          id: "S7-1",
          pass: false,
          failing: unanswered.map((o) => o.id),
          message: `${unanswered.map((o) => o.id).join(", ")} is asked in Section 1 and answered by no table. The question survives into the thesis and the result never appears.`,
        },
  );

  /* S7-2 backward: every variable reaches a table, or is excused. */
  const excused = new Set(["administrative", "population_definition"]);
  const orphans = variables.filter((variable) => {
    if (excused.has(variable.roles[STUDY] ?? "")) return false;
    if (tables.some((t) => t.variables.includes(variable.name))) return false;
    // A raw input reaches its table through the value computed from it.
    return !variables.some(
      (other) =>
        other.derived_from.includes(variable.name) &&
        tables.some((t) => t.variables.includes(other.name)),
    );
  });
  results.push(
    orphans.length === 0
      ? ok("S7-2", "Every variable appears in a table, or is administrative or a population definition.")
      : {
          id: "S7-2",
          pass: false,
          failing: orphans.map((v) => v.name),
          message: `${orphans.map((v) => v.label).join(", ")} ${orphans.length === 1 ? "is" : "are"} collected and reported nowhere. Either an analysis is missing or the capture is, and the form asks somebody to fill it in for every participant either way.`,
        },
  );

  /* S7-3 adjustment integrity: every covariate exists. */
  const ghostCovariates = analysis.flatMap((row) =>
    (row.adjusted?.covariates ?? [])
      .filter((c) => !byName.has(c.var))
      .map((c) => `${row.objective}: ${c.var}`),
  );
  results.push(
    ghostCovariates.length === 0
      ? ok("S7-3", "Every covariate of every adjusted model is on the variable list.")
      : {
          id: "S7-3",
          pass: false,
          failing: ghostCovariates,
          message: `${ghostCovariates.join("; ")} is held constant by a model and collected by nothing.`,
        },
  );

  /* S7-4 exploratory integrity: nothing used that was not listed. */
  const names = new Set(variables.map((v) => v.name));
  const strayExploratory = exploratory.flatMap((e) =>
    e.reuses.filter((n) => !names.has(n)).map((n) => `${e.id}: ${n}`),
  );
  results.push(
    strayExploratory.length === 0
      ? ok("S7-4", "No exploratory table uses a variable outside the list.")
      : {
          id: "S7-4",
          pass: false,
          failing: strayExploratory,
          message: `${strayExploratory.join("; ")} appears in an exploratory table and on no list. It was neither collected nor promoted.`,
        },
  );

  /* S7-5 placement: sensitivity last, note lines present, population line. */
  const primary = numbered.filter((t) => t.block === "primary");
  const sensitivity = primary.find((t) => t.kind === "sensitivity");
  const misplaced =
    primary.length > 0 && sensitivity && primary[primary.length - 1] !== sensitivity;
  const families = [...new Set(objectives.map((o) => o.family))];
  const noteless = families.filter((f) => !rules.multiplicity[f]?.trim());
  const placementBad = misplaced || noteless.length > 0 || !rules.population_line.trim();
  results.push(
    !placementBad
      ? ok("S7-5", "The sensitivity table closes the primary block, every family heading carries its note line, and the primary block opens with its population line.")
      : {
          id: "S7-5",
          pass: false,
          failing: [
            ...(misplaced ? ["sensitivity"] : []),
            ...noteless,
            ...(rules.population_line.trim() ? [] : ["population line"]),
          ],
          message: misplaced
            ? "The sensitivity table is not the last table of the primary block. Read in any other position it looks like a separate analysis rather than a test of the estimate above it."
            : noteless.length
              ? `The ${noteless.join(" and ")} heading carries no multiplicity note.`
              : "The primary block opens with no analysis-population line, so no table in it says which participants it counts.",
        },
  );

  /* S7-6 population integrity. */
  const hasPopulations = rules.populations.length > 0;
  const nonInferiority = facts.design === "non_inferiority_trial";
  const bothSets =
    !nonInferiority ||
    (rules.populations.some((p) => /intention to treat/i.test(p.name)) &&
      rules.populations.some((p) => /per protocol/i.test(p.name)));
  results.push(
    hasPopulations && bothSets
      ? ok("S7-6", "The analysis population is named, and a non-inferiority trial carries both sets.")
      : {
          id: "S7-6",
          pass: false,
          failing: ["populations"],
          message: !hasPopulations
            ? "No analysis population is defined."
            : "A non-inferiority trial needs both the intention-to-treat and the per-protocol analysis. Dropping the non-adherent participants makes the arms look more alike, which is the direction that favours the claim being made.",
        },
  );

  /* S7-8 model integrity. */
  const modelTables = tables.filter((t) =>
    ["adjusted", "rate_of_change", "ratio", "cox"].includes(t.kind),
  );
  const unfitted = modelTables.filter(
    (t) => !tables.some((f) => f.fit_table_of === t.number),
  );
  const unchecked = tables
    .filter((t) => t.kind === "adjusted")
    .filter((t) => {
      const before = numbered.slice(0, numbered.indexOf(t));
      return !before.some((p) => p.kind === "overlap");
    });
  const twoSets = analysis.filter(
    (row) =>
      row.adjusted &&
      new Set(row.adjusted.covariates.map((c) => c.var)).size !==
        row.adjusted.covariates.length,
  );
  const modelBad = [...unfitted, ...unchecked];
  results.push(
    modelBad.length === 0 && twoSets.length === 0
      ? ok("S7-8", "Every model table has a fit table, every adjusted table has an overlap table before it, and each outcome has one adjustment set.")
      : {
          id: "S7-8",
          pass: false,
          failing: [...modelBad.map((t) => t.number), ...twoSets.map((r) => r.objective)],
          message: unfitted.length
            ? `Table ${unfitted.map((t) => t.number).join(", ")} fits a model and reports no diagnostics.`
            : unchecked.length
              ? `Table ${unchecked.map((t) => t.number).join(", ")} adjusts with no overlap check before it.`
              : `${twoSets.map((r) => r.objective).join(", ")} names the same covariate twice. One pre-specified set per outcome, and no ladder of models.`,
        },
  );

  /* S7-9 binary integrity. */
  const binaryBad = analysis.filter(
    (row) =>
      row.data_type === "binary" &&
      !row.exception &&
      (!row.absolute ||
        !row.adjusted?.fallback ||
        (/odds ratio/i.test(row.effect_measure) &&
          (row.expected_frequency ?? 1) >= 0.1)),
  );
  results.push(
    binaryBad.length === 0
      ? ok("S7-9", "Every binary row states its measure, model and fallback, and carries its absolute difference.")
      : {
          id: "S7-9",
          pass: false,
          failing: binaryBad.map((r) => r.objective),
          message: `${binaryBad.map((r) => r.objective).join(", ")} reports a ratio with no absolute difference beside it, no named fallback, or an odds ratio for an outcome that is not rare. A ratio alone cannot say whether the difference matters.`,
        },
  );

  /* S7-10 repeated-measures integrity. */
  const chains = [facts.primary, ...facts.secondary].filter(isRepeated);
  const halfAnalysed = chains.filter((chain) => {
    const forChain = analysis.filter((r) =>
      [...chain.measures].includes(r.outcome) || r.outcome.includes(chain.measures[0] ?? ""),
    );
    return !forChain.some((r) => r.objective.endsWith("b"));
  });
  const testedPerVisit = tables.filter(
    (t) => t.kind === "per_time_point" && t.columns.some((c) => c.trim().toLowerCase() === "p"),
  );
  results.push(
    halfAnalysed.length === 0 && testedPerVisit.length === 0
      ? ok("S7-10", "Every repeated outcome has a level and a shape analysis, and no per-visit table carries a p column.")
      : {
          id: "S7-10",
          pass: false,
          failing: [
            ...halfAnalysed.map((c) => c.what),
            ...testedPerVisit.map((t) => t.number),
          ],
          message: halfAnalysed.length
            ? `${halfAnalysed.map((c) => `"${c.what}"`).join(", ")} is measured at every visit and analysed only once. The visits in between are collected and thrown away.`
            : `Table ${testedPerVisit.map((t) => t.number).join(", ")} tests each visit separately. That is one question asked several times, reported at its smallest answer.`,
        },
  );

  /* S7-11 title-promise integrity: the promise reaches a table. */
  const broken = promisesIn(facts.title).filter((promise) => {
    if (!promise.kept(facts, objectives)) return true;
    if (promise.id !== "trajectory") return false;
    // The one the worked example failed on: the shape objective existed and no
    // table reported it.
    return !tables.some((t) => t.kind === "rate_of_change");
  });
  results.push(
    broken.length === 0
      ? ok("S7-11", "Every analysis the title promises reaches a table.")
      : {
          id: "S7-11",
          pass: false,
          failing: broken.map((p) => p.id),
          message: broken
            .map((p) => `The title promises ${p.promise} and no table reports it. ${p.remedy}`)
            .join(" "),
        },
  );

  /* S7-12 number integrity. */
  const dangling = analysis.flatMap((row) =>
    [row.unadjusted?.table, row.adjusted?.table, row.adjusted?.fit_table]
      .filter((n): n is string => Boolean(n))
      .filter((n) => !tables.some((t) => t.number === n))
      .map((n) => `${row.objective} points at Table ${n}`),
  );
  const counts =
    input.pinned.tables === numbered.length &&
    input.pinned.fits === tables.length - numbered.length &&
    input.pinned.figures === input.figures.length;
  results.push(
    dangling.length === 0 && counts
      ? ok("S7-12", "Every number in the Analysis Map is a table in Section 6, and the pinned count is the count.")
      : {
          id: "S7-12",
          pass: false,
          failing: dangling.length ? dangling : [`${input.pinned.tables}`],
          message: dangling.length
            ? `${dangling.join("; ")}, which does not exist. A number pointing at nothing is worse than no number: it points at a table that exists and is not the one it means.`
            : `The plan pins ${input.pinned.tables} tables and ${numbered.length} are drawn. The pinned count is the contract with the results chapter.`,
        },
  );

  return results;
}

/** True where nothing blocks the SAP from being rendered. */
export const gateBPasses = (input: GateBInput) => gateB(input).every((r) => r.pass);
