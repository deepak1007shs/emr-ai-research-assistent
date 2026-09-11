import fs from "node:fs";
import path from "node:path";
import { parseTable, type Row } from "../analysis/decision-tables.ts";
import { isSafety } from "../analysis/build.ts";
import { assumptionFor } from "../rules/build.ts";
import type {
  AnalysisRow,
  ExploratoryOutcome,
  FactsSheet,
  Objective,
  OutcomeChain,
  Rules,
  ShellTable,
  TableRow,
  Variable,
  VariableName,
} from "../study/types.ts";
import { ARM } from "../variables/build.ts";
import { variableName } from "../variables/name.ts";

/**
 * Step 6: every empty results table the thesis will carry.
 *
 * The table set is pinned. Which tables an outcome owes is read from
 * `templates.md`, which is Appendix A4, and nothing here chooses. That is the
 * whole repair: the same protocol gave sixteen, eighteen, nineteen and twenty
 * tables on four runs of the old build, because the set was decided each time
 * by a model that was free to decide differently.
 *
 * Every value cell is blank and stays blank. What is drawn is the grid, the row
 * labels, the column headings and one footnote naming the test.
 */

const DIR = path.join(process.cwd(), "src", "lib", "tables");
let templateRows: Row[] | null = null;

export function templates(): Row[] {
  if (!templateRows) {
    templateRows = parseTable(
      fs.readFileSync(path.join(DIR, "templates.md"), "utf8"),
    );
  }
  return templateRows;
}

export type TableSet = {
  tables: ShellTable[];
  /** "Figure 1" and what it shows, kept apart because it is numbered apart. */
  figures: { number: string; block: string; caption: string; footnote: string }[];
  todos: string[];
};

/* ---- the words a row label is built from ---------------------------- */

/** "Mean ± SD" for a normal continuous value, "Median (IQR)" for a skewed one. */
function summaryOf(variable: Variable, skewed: Set<string>): string {
  if (variable.type === "continuous") {
    return skewed.has(variable.name) ? "Median (IQR)" : "Mean ± SD";
  }
  if (variable.type === "count") return "Median (IQR)";
  if (variable.type === "time_to_event") return "Median (95% CI)";
  return "n (%)";
}

/**
 * One label, or one per category.
 *
 * Rule 6.1.3: the name, the unit and the summary type; a categorical variable
 * gets one row per category in the order the options were written, which is
 * Yes before No and Male before Female because that is the order the dictionary
 * holds them in.
 */
function rowsFor(variable: Variable, skewed: Set<string>): TableRow[] {
  if (variable.options?.length) {
    return variable.options.map((option) => ({
      label: `${variable.label} - ${option}`,
      variable: variable.name,
      indent: true,
    }));
  }
  const unit = variable.unit ? ` (${variable.unit})` : "";
  return [
    {
      label: `${variable.label}${unit} - ${summaryOf(variable, skewed)}`,
      variable: variable.name,
      indent: false,
    },
  ];
}

const blank = (label: string): TableRow => ({ label, variable: null, indent: false });

/* ---- the builder ----------------------------------------------------- */

export function buildTables(
  facts: FactsSheet,
  objectives: Objective[],
  variables: Variable[],
  analysis: AnalysisRow[],
  exploratory: ExploratoryOutcome[],
  rules: Rules,
): TableSet {
  const tables: ShellTable[] = [];
  const figures: TableSet["figures"] = [];
  const todos: string[] = [];
  const byName = new Map(variables.map((v) => [v.name, v]));
  const skewed = new Set(
    [facts.primary, ...facts.secondary]
      .filter((c) => c.distribution === "skewed")
      .flatMap((c) => [variableName(c.what), ...c.measures]),
  );

  const groups = facts.groups;
  const groupColumns = groups.map((g) => `${g.code} (n = )`);
  const comparative = groups.length >= 2;
  const [a, b] = groups;
  const versus = comparative ? `${a.code} − ${b.code}` : "";

  let n = 0;
  const next = () => `${++n}`;
  const add = (table: ShellTable) => {
    tables.push(table);
    return table;
  };

  /* ---- Block A: the descriptive tables ---------------------------- */
  const blocks: string[] = [];
  for (const measure of facts.measures) {
    if (measure.block && !blocks.includes(measure.block)) blocks.push(measure.block);
  }

  for (const block of blocks) {
    const members = facts.measures
      .filter((m) => m.block === block)
      .map((m) => byName.get(m.name))
      .filter((v): v is Variable => Boolean(v));

    add({
      number: next(),
      block: "descriptive",
      kind: "descriptive",
      title: `Baseline ${block} by ${comparative ? "arm" : "group"}`,
      columns: comparative
        ? ["Variable", ...groupColumns]
        : ["Variable", "n (%) or Mean ± SD"],
      rows: members.flatMap((v) => rowsFor(v, skewed)),
      // Rule 6.3.4: in a randomised trial a baseline difference is chance, and
      // testing it asks whether the randomisation worked, which it did.
      footnote: isRandomised(facts)
        ? "descriptive only (randomised trial: baseline differences are not tested)"
        : "descriptive; t-test or Mann-Whitney for continuous variables, chi-square for categorical",
      fit_table_of: null,
      fills: [],
      variables: members.map((v) => v.name),
    });
  }

  /* ---- Blocks B, C and D: one group of tables per outcome chain ---- */
  // The objective ids Step 1 fixed are what links a chain to its rows. Matching
  // on the outcome variable instead looks right and is not: the trajectory
  // question about haemoglobin and the threshold question about anaemia
  // correction are both rows whose outcome involves haemoglobin, and the
  // secondary's table would take the primary's model into its footnote.
  const chains: {
    chain: OutcomeChain;
    block: ShellTable["block"];
    stem: string;
  }[] = [
    { chain: facts.primary, block: "primary", stem: "P1" },
    ...facts.secondary.map((chain, i) => ({
      chain,
      block: "secondary" as const,
      stem: `S${i + 1}`,
    })),
  ];

  for (const { chain, block, stem } of chains) {
    const rows = analysis.filter(
      (r) => r.objective === stem || r.objective === `${stem}a` || r.objective === `${stem}b`,
    );
    if (!rows.length) continue;

    const key = situationOf(chain, rows, skewed);
    const template = templates().find((t) => t.Key === key);
    if (!template) {
      todos.push(
        `No table template covers "${chain.what}", which is ${key.replace(/_/g, " ")}. Say which tables it owes.`,
      );
      continue;
    }

    const level =
      rows.find((r) => r.objective === stem || r.objective === `${stem}a`) ?? rows[0];
    const shape = rows.find((r) => r.objective === `${stem}b`) ?? null;

    let previous: ShellTable | null = null;
    for (const kind of template.Tables.split(",").map((k) => k.trim())) {
      if (kind === "fit") {
        if (!previous) continue;
        const model = previous.footnote;
        const assumption = assumptionFor(model);
        add({
          number: `${previous.number}a`,
          block,
          kind: "fit",
          title: `Model fit and assumptions for Table ${previous.number}`,
          columns: ["Item", "Value"],
          rows: fitRows(assumption),
          footnote: `diagnostics for ${model}`,
          fit_table_of: previous.number,
          fills: previous.fills,
          variables: [],
        });
        continue;
      }

      if (kind === "figure") {
        figures.push({
          number: `${figures.length + 1}`,
          block,
          caption: `${label(chain)} over time by ${comparative ? "arm" : "group"}, on one continuous time axis from ${chain.time[0]} to ${chain.time[chain.time.length - 1]}`,
          footnote: "means with 95% confidence intervals at each visit",
        });
        continue;
      }

      previous = add(
        drawTable({
          kind,
          number: next(),
          block,
          chain,
          level,
          shape,
          facts,
          byName,
          skewed,
          versus,
          comparative,
          rules,
          todos,
        }),
      );
    }

    /* Rule 6.7: the sensitivity table is always the primary block's last. */
    if (block === "primary") {
      add({
        number: next(),
        block,
        kind: "sensitivity",
        title: "Sensitivity analyses",
        columns: ["Analysis", `${label(chain)} - effect (95% CI)`],
        rows: rules.sensitivity_rows.map(blank),
        footnote:
          "robustness of the primary estimate to missing-data and definition choices",
        fit_table_of: null,
        fills: rows.map((r) => r.objective),
        variables: [variableName(chain.what)],
      });
    }
  }

  /* ---- Block D: one table per exploratory question ----------------- */
  for (const outcome of exploratory) {
    const row = analysis.find((r) => r.objective === outcome.id);
    if (!row) continue;
    const outcomeVariable = byName.get(row.outcome);
    const by = byName.get(outcome.reuses[1] ?? "");

    if (outcome.kind === "correlation") {
      add({
        number: next(),
        block: "exploratory",
        kind: "correlation",
        title: `Correlation of ${by?.label.toLowerCase() ?? "the second variable"} with ${lower(label2(outcomeVariable))}`,
        columns: ["Outcome pair", "ρ", "95% CI", "p"],
        rows: [blank(`${by?.label ?? "?"} and ${outcomeVariable?.label ?? "?"}`)],
        footnote: `${row.unadjusted?.test ?? "rank correlation"}; exploratory`,
        fit_table_of: null,
        fills: [outcome.id],
        variables: outcome.reuses,
      });
      continue;
    }

    const strata = by?.options?.length
      ? by.options.map((option) => blank(`${by.label} - ${option}`))
      : [
          blank(
            `**TODO:** state the cut-off that splits ${by?.label.toLowerCase() ?? "the variable"} into groups, then one row per group.`,
          ),
        ];
    if (!by?.options?.length) {
      todos.push(
        `${outcome.id} splits the sample by ${by?.label.toLowerCase() ?? "a continuous variable"} and no cut-off is stated. A cut-off chosen after the data arrive is a different analysis from the one being planned.`,
      );
    }

    add({
      number: next(),
      block: "exploratory",
      kind: "subgroup",
      title: `${label2(outcomeVariable)} by ${by?.label.toLowerCase() ?? "subgroup"} and ${comparative ? "arm" : "group"}`,
      columns: [
        `${by?.label ?? "Subgroup"}`,
        ...groups.map((g) => g.code),
        "Difference (95% CI)",
      ],
      rows: strata,
      footnote: `${row.adjusted?.model ?? "regression with an interaction term"}; exploratory`,
      fit_table_of: null,
      fills: [outcome.id],
      variables: outcome.reuses,
    });
  }

  return { tables, figures, todos };
}

/* ---- helpers --------------------------------------------------------- */

const isRandomised = (facts: FactsSheet) =>
  facts.design.includes("randomised") ||
  facts.design === "cluster_trial" ||
  facts.design === "crossover_trial" ||
  facts.design === "factorial_trial" ||
  facts.design === "non_inferiority_trial";

const label = (chain: OutcomeChain) => chain.what;
const label2 = (variable: Variable | undefined) => variable?.label ?? "Outcome";

/** Which row of the template file this outcome reads. */
function situationOf(
  chain: OutcomeChain,
  rows: AnalysisRow[],
  skewed: Set<string>,
): string {
  if (isSafety(chain)) return "safety";
  if (rows.every((r) => r.exception === "estimation")) return "estimation";
  if (chain.type === "time_to_event") return "time_to_event";
  if (chain.type === "count") return "count_outcome";
  if (chain.type === "binary" || chain.type === "nominal" || chain.type === "ordinal") {
    if (rows.some((r) => r.exception === "too_few_events")) return "binary_few_events";
    return (chain.expected_frequency ?? 0.5) < 0.1 ? "binary_rare" : "binary_common";
  }
  if (rows.some((r) => r.objective.endsWith("b"))) return "continuous_repeated";
  if (skewed.has(variableName(chain.what))) return "skewed_continuous";
  return "continuous_single";
}

/** The rows of a fit table: what was reported, then what was checked. */
function fitRows(assumption: Row | null): TableRow[] {
  const split = (text: string) =>
    text
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean);

  const rows: TableRow[] = [
    blank("Model fitted, and any transformation"),
    blank("Observations, and clusters where there are any"),
    ...split(assumption?.Reported ?? "").map(blank),
    ...split(assumption?.["Assumption and how it is checked"] ?? "").map((check) =>
      blank(`${check} - met or not met`),
    ),
    blank("Convergence"),
    blank("Candidate models rejected, and on which assumption"),
  ];
  return rows;
}

type DrawArgs = {
  kind: string;
  number: string;
  block: ShellTable["block"];
  chain: OutcomeChain;
  level: AnalysisRow;
  shape: AnalysisRow | null;
  facts: FactsSheet;
  byName: Map<VariableName, Variable>;
  skewed: Set<string>;
  versus: string;
  comparative: boolean;
  rules: Rules;
  todos: string[];
};

function drawTable(args: DrawArgs): ShellTable {
  const {
    kind, number, block, chain, level, shape, facts, byName, skewed,
    versus, comparative, todos,
  } = args;
  const outcome = byName.get(level.outcome);
  const measures = chain.measures
    .map((m) => byName.get(m))
    .filter((v): v is Variable => Boolean(v));
  const codes = facts.groups.map((g) => g.code);
  const unitOf = (variable: Variable | undefined) =>
    variable?.unit ? ` (${variable.unit})` : "";

  const base = {
    number,
    block,
    kind,
    fit_table_of: null,
    variables: [level.outcome, ...chain.measures],
  };

  switch (kind) {
    case "summary": {
      const how = skewed.has(level.outcome)
        ? "Median (IQR)"
        : "Mean ± SD (95% CI)";
      const first = chain.time[0];
      const last = chain.time[chain.time.length - 1];
      const rows =
        measures.length && chain.time.length > 1
          ? [
              blank(`${measures[0].label}${unitOf(measures[0])} at ${first}`),
              blank(`${measures[0].label}${unitOf(measures[0])} at ${last}`),
              blank(`${chain.what}${unitOf(outcome)}`),
            ]
          : [blank(`${chain.what}${unitOf(outcome)}`)];
      const named =
        chain.time.length > 1 && measures.length
          ? `${measures[0].label} at ${first} and ${last}, and the change,`
          : `${chain.what}`;
      return {
        ...base,
        title: `${named} by ${comparative ? "arm" : "group"} - summary`,
        columns: comparative
          ? ["Outcome", ...codes.map((c) => `${c} - ${how}`)]
          : ["Outcome", how],
        rows,
        footnote: "estimation with 95% CI",
        fills: [level.objective],
      };
    }

    case "summary_test": {
      const first = chain.time[0];
      const last = chain.time[chain.time.length - 1];
      const named =
        chain.time.length > 1 && measures.length
          ? `${measures[0].label} at ${first} and ${last}, and the change,`
          : `${chain.what}`;
      return {
        ...base,
        title: `${named} by ${comparative ? "arm" : "group"}`,
        columns: [
          "Outcome",
          ...codes.map((c) => `${c} - Median (IQR)`),
          "Hodges-Lehmann difference (95% CI)",
          "p",
        ],
        rows:
          measures.length && chain.time.length > 1
            ? [
                blank(`${measures[0].label}${unitOf(measures[0])} at ${first}`),
                blank(`${measures[0].label}${unitOf(measures[0])} at ${last}`),
                blank(`${chain.what}${unitOf(outcome)}`),
              ]
            : [blank(`${chain.what}${unitOf(outcome)}`)],
        footnote: footnoteFor(level.unadjusted),
        fills: [level.objective],
      };
    }

    case "unadjusted":
      return {
        ...base,
        title: `Unadjusted comparison of ${lower(chain.what)}`,
        columns: [
          "Outcome",
          skewed.has(level.outcome)
            ? `Median difference (${versus})`
            : `Mean difference (${versus})`,
          "95% CI",
          "p",
        ],
        rows: [blank(`${chain.what}${unitOf(outcome)}`)],
        footnote: footnoteFor(level.unadjusted),
        fills: [level.objective],
      };

    case "per_time_point":
      return {
        ...base,
        title: `${measures[0]?.label ?? chain.what} at each visit by ${comparative ? "arm" : "group"} (descriptive)`,
        columns: ["Visit", ...codes.map((c) => `${c} - Mean ± SD (n)`)],
        rows: chain.time.map(blank),
        // Rule 4.13: k tests at k visits for one question is wrong, and the
        // one test is in the rate-of-change table below.
        footnote: `descriptive only - no test at single time points; the change over time is tested once, in Table ${Number(number) + 1}`,
        fills: shape ? [shape.objective] : [],
      };

    case "rate_of_change": {
      const perWeek = `${outcome?.unit ?? measures[0]?.unit ?? ""} per ${timeUnit(chain.time)}`;
      return {
        ...base,
        title: `Rate of change in ${lower(measures[0]?.label ?? chain.what)} over the study period`,
        columns: ["Term", `Estimate (${perWeek})`, "95% CI", "p"],
        rows: [
          ...codes.map((code) => blank(`Slope - ${code}`)),
          blank(`Slope difference (${versus}) = ${ARM} by time`),
        ],
        footnote: footnoteFor(shape?.adjusted ?? null, shape?.adjusted?.model),
        fills: shape ? [shape.objective] : [],
      };
    }

    case "overlap": {
      const covariates = level.adjusted?.covariates ?? [];
      if (!covariates.length) {
        todos.push(
          `Table ${number} checks that the arms overlap on the covariates of the adjusted model for ${level.objective}, and that model has none.`,
        );
      }
      return {
        ...base,
        title: "Covariate overlap check before adjustment",
        columns: [
          "Covariate",
          ...codes.map((c) => `Range in ${c}`),
          "Overlap region",
          "Participants inside the overlap n (%)",
          "Standardised difference",
        ],
        rows: covariates.map((c) => blank(byName.get(c.var)?.label ?? c.var)),
        footnote:
          "positivity check. **TODO:** where a covariate does not overlap, the adjusted estimate is not estimable for the part that does not, and the adjusted column is dropped",
        fills: [level.objective],
        variables: covariates.map((c) => c.var),
      };
    }

    case "adjusted":
      return {
        ...base,
        title: `Adjusted comparison of ${lower(chain.what)}`,
        columns: ["Term", "Unadjusted effect (95% CI)", "Adjusted effect (95% CI)", "p"],
        rows: [
          blank(`${ARM} - ${codes[0] ?? "the exposed group"} versus ${codes[1] ?? "the reference"}`),
          ...(level.adjusted?.covariates ?? []).map((c) =>
            blank(
              `${byName.get(c.var)?.label ?? c.var}${c.at ? ` at ${c.at}` : ""}`,
            ),
          ),
        ],
        footnote: footnoteFor(level.adjusted, level.adjusted?.model),
        fills: [level.objective],
        variables: [
          level.outcome,
          ...(level.adjusted?.covariates ?? []).map((c) => c.var),
        ],
      };

    case "ratio":
      return {
        ...base,
        title: `${chain.what}${chain.time.length ? ` at ${chain.time[chain.time.length - 1]}` : ""}`,
        columns: [
          "Comparison",
          ...codes.map((c) => `${c} n/N (%)`),
          `${level.effect_measure} (95% CI)`,
          `${level.absolute ?? "Absolute difference"} (95% CI)`,
          "p",
        ],
        rows: [
          blank(`${codes[0] ?? "Exposed"} versus ${codes[1] ?? "reference"} - unadjusted`),
          blank(`${codes[0] ?? "Exposed"} versus ${codes[1] ?? "reference"} - adjusted`),
          blank(`${codes[1] ?? "Reference"} - 1 (reference)`),
        ],
        footnote: footnoteFor(level.adjusted, level.adjusted?.model),
        fills: [level.objective],
      };

    case "proportions":
      return {
        ...base,
        title: `${chain.what} by ${comparative ? "arm" : "group"} (descriptive only)`,
        columns: ["Comparison", ...codes.map((c) => `${c} n/N (%)`), "p"],
        rows: [blank(chain.what)],
        footnote:
          "exact proportions with Fisher's exact test; too few events to fit a model, so no adjusted estimate is reported",
        fills: [level.objective],
      };

    case "safety": {
      const variable = byName.get(level.outcome);
      const rows = variable?.options?.length
        ? [blank(`${variable.label} - ${variable.options[0]}`)]
        : [blank(chain.what)];
      todos.push(
        `List the adverse effects Table ${number} reports, one row each. "${chain.what}" as a single row hides which harm occurred, and the safety set is the one place that matters most.`,
      );
      return {
        ...base,
        title: `${chain.what} by ${comparative ? "arm" : "group"} (safety set)`,
        columns: [
          "Adverse effect",
          ...codes.map((c) => `${c} n (%)`),
          "Risk difference (95% CI)",
          "p",
        ],
        rows,
        footnote: footnoteFor(level.unadjusted),
        fills: [level.objective],
      };
    }

    default:
      return {
        ...base,
        title: `${chain.what}`,
        columns: ["Item", "Value"],
        rows: [blank(chain.what)],
        footnote: footnoteFor(level.unadjusted),
        fills: [level.objective],
      };
  }
}

/**
 * The unit a slope is written in, read off the visit codes.
 *
 * "D0, W2, W4, W6" is a study measured in weeks, and a rate reported per unit
 * of time is a rate nobody can interpret. Taken from the follow-up visits and
 * not the first, because the first is day 0 in almost every schedule.
 */
function timeUnit(times: string[]): string {
  const letters = times.slice(1).map((code) => code[0]?.toUpperCase());
  const words: Record<string, string> = { D: "day", W: "week", M: "month", Y: "year" };
  const counts = new Map<string, number>();
  for (const letter of letters) {
    if (words[letter]) counts.set(letter, (counts.get(letter) ?? 0) + 1);
  }
  const best = [...counts.entries()].sort((x, y) => y[1] - x[1])[0];
  return best ? words[best[0]] : "unit of time";
}

const lower = (text: string) =>
  text && text[0] === text[0].toUpperCase() && !/^[A-Z]{2,}/.test(text)
    ? text[0].toLowerCase() + text.slice(1)
    : text;

/** The footnote line: the test, and the named fallback where there is one. */
function footnoteFor(
  entry: { test?: string; model?: string; fallback: string | null } | null,
  model?: string,
): string {
  if (!entry) return "descriptive only";
  const named = model ?? entry.test ?? entry.model ?? "";
  return entry.fallback ? `${named} (fallback: ${entry.fallback})` : named;
}

/**
 * Step 4.12: write the final table numbers back into the Analysis Map.
 *
 * The numbers in the map are provisional until Step 6 has drawn everything,
 * because only Step 6 knows the order. A map still carrying the provisional
 * numbers is worse than one carrying none: it points at a table that exists and
 * is not the one it means.
 */
export function numberTheMap(
  analysis: AnalysisRow[],
  tables: ShellTable[],
): AnalysisRow[] {
  // Which kind of table answers which half of a row. A ratio table carries the
  // crude and the adjusted estimate in one grid, so it answers both.
  const UNADJUSTED = ["unadjusted", "summary_test", "per_time_point", "ratio", "safety", "proportions", "correlation", "summary"];
  const ADJUSTED = ["adjusted", "rate_of_change", "ratio", "subgroup", "cox"];

  return analysis.map((row) => {
    const mine = tables.filter((t) => t.fills.includes(row.objective));
    const pick = (kinds: string[]) =>
      kinds.map((k) => mine.find((t) => t.kind === k)).find(Boolean) ?? null;

    const model = pick(ADJUSTED);
    const fit = mine.find((t) => t.fit_table_of === model?.number);

    return {
      ...row,
      unadjusted: row.unadjusted
        ? { ...row.unadjusted, table: pick(UNADJUSTED)?.number ?? "" }
        : null,
      adjusted: row.adjusted
        ? {
            ...row.adjusted,
            table: model?.number ?? "",
            fit_table: fit?.number ?? "",
          }
        : null,
    };
  });
}
