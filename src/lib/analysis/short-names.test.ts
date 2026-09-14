import { describe, expect, it } from "vitest";
import { binaryModels, screens, tests } from "./decision-tables.ts";
import { buildSap } from "../sap/build.ts";
import { idaPreg } from "../facts/fixture.ts";
import { elastography } from "../facts/fixture-diagnostic.ts";
import { vishal } from "../facts/fixture-vishal.ts";
import type { FactsSheet } from "../study/types.ts";

/**
 * The names the Analysis Map prints.
 *
 * A short name shortens and never renames: it may leave out how an interval is
 * made or what is fitted when the first model fails, because the footnote of
 * the table the row names carries both, but it may not name an analysis the
 * full sentence does not run, nor drop one that it does.
 */

const LONG = 45;
const none = { ratio: "", block: null, strata: [], matched: null };

const shapes: [string, FactsSheet][] = [
  ["IDA-PREG", idaPreg],
  ["elastography", elastography],
  ["a cohort asking about associations", vishal],
  ["a single group", { ...idaPreg, design: "cross_sectional", groups: [], exploratory_ideas: [], allocation: none }],
  ["a cluster trial", { ...idaPreg, design: "cluster_trial" }],
  ["a skewed primary", { ...idaPreg, primary: { ...idaPreg.primary, distribution: "skewed" } }],
  ["a rare binary primary", { ...idaPreg, primary: { ...idaPreg.primary, type: "binary", expected_frequency: 0.05 } }],
  // Every outcome measured after baseline only, so no model is analysis of
  // covariance and the short name must not say it is.
  ["no baseline reading", { ...idaPreg, timepoints: ["X0", ...idaPreg.timepoints] }],
  // A repeated ordered outcome in one group: the model's "group-by-time term"
  // becomes "time as a fixed effect", and the short name must follow. Ordered
  // and not yes-or-no, because a repeated yes-or-no outcome has its model
  // replaced by decision table C and never reaches a group-by-time term.
  [
    "a repeated ordered outcome in one group",
    {
      ...idaPreg,
      design: "cross_sectional",
      groups: [],
      exploratory_ideas: [],
      allocation: none,
      // The data type is read from the measure, not from the outcome chain.
      measures: idaPreg.measures.map((m) =>
        m.name === "haemoglobin" ? { ...m, type: "ordinal" as const, unit: null, options: ["1", "2", "3"] } : m,
      ),
    },
  ],
];

/**
 * The leading term of a short name, found in its full sentence.
 *
 * The one check that a short name names the same analysis: "Log-binomial
 * regression" printed for a Firth model is a renaming, and no clause-by-clause
 * comparison sees it. Four short names lead with a word the sentence spells
 * out, and they are listed here rather than matched loosely.
 */
const SPELLED_OUT: Record<string, string> = {
  auc: "area under",
  gee: "generalised estimating equations",
  each: "one factor at a time",
  ordinal: "cumulative-link",
};
function sameAnalysis(full: string, short: string): boolean {
  const lead = short.split(/[\s,;:(]/)[0].toLowerCase();
  return full.toLowerCase().includes(SPELLED_OUT[lead] ?? lead);
}

describe("the decision tables' short names", () => {
  const cells: [string, string, string][] = [
    ...tests().flatMap((r) => [
      [r.Key, r["Unadjusted test"], r["Unadjusted short"]] as [string, string, string],
      [r.Key, r["Adjusted model"], r["Adjusted short"]] as [string, string, string],
    ]),
    ...binaryModels().map((r) => [r.Key, r.Model, r.Short] as [string, string, string]),
    ...screens().map((r) => [r.Key, r.Test, r.Short] as [string, string, string]),
  ];

  it(`gives every name longer than ${LONG} characters a short one`, () => {
    for (const [key, full, short] of cells) {
      if (full.length > LONG) expect(short, `${key}: ${full}`).toBeTruthy();
    }
  });

  it("leads every short name with a term its full name uses", () => {
    for (const [key, full, short] of cells) {
      if (short) expect(sameAnalysis(full, short), `${key}: ${short}`).toBe(true);
    }
  });

  it("makes every short name shorter than the name it shortens", () => {
    for (const [key, full, short] of cells) {
      if (short) expect(short.length, key).toBeLessThan(full.length);
    }
  });
});

describe.each(shapes)("the map's names, %s", (_name, facts) => {
  const rows = buildSap(facts).analysis;
  const pairs = rows.flatMap((r) => [
    ...(r.unadjusted ? [[r.objective, r.unadjusted.test, r.unadjusted.short] as const] : []),
    ...(r.adjusted ? [[r.objective, r.adjusted.model, r.adjusted.short] as const] : []),
  ]);

  it("gives every test and model a short name", () => {
    for (const [objective, , short] of pairs) expect(short, objective).toBeTruthy();
  });

  it("never names a condition as if it were the test", () => {
    for (const [objective, full, short] of pairs) {
      expect(short, objective).not.toMatch(/\bwhere\b/);
      expect(full, objective).not.toMatch(/ test where the (factor|outcome) is skewed$/);
    }
  });

  it("names analysis of covariance, the log scale and an interaction exactly when the model does", () => {
    for (const [objective, full, short] of pairs) {
      expect(/ANCOVA/.test(short!), `${objective} ANCOVA`).toBe(/analysis of covariance/.test(full));
      expect(/log scale/.test(short!), `${objective} log scale`).toBe(/log scale/.test(full));
      expect(/interaction term/.test(short!), `${objective} interaction`).toBe(/interaction term/.test(full));
      expect(/DeLong's test/.test(short!), `${objective} DeLong`).toBe(/compared by DeLong's test/.test(full));
      expect(/group-by-(time|visit)/.test(short!), `${objective} group term`).toBe(/group-by-(time|visit) (term|interaction)/.test(full));
    }
  });

  it("names the same analysis as the full sentence", () => {
    for (const [objective, full, short] of pairs) {
      expect(sameAnalysis(full, short!), `${objective}: "${short}" for "${full}"`).toBe(true);
    }
  });
});
