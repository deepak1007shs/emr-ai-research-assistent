import { describe, expect, it } from "vitest";
import { buildSap } from "../sap/build.ts";
import { idaPreg } from "../facts/fixture.ts";
import { elastography } from "../facts/fixture-diagnostic.ts";
import { vishal } from "../facts/fixture-vishal.ts";

/**
 * The footnote of the table a row names says which test produced it.
 *
 * An accuracy objective inside a study that is not a diagnostic study - a
 * trauma cohort asking how well a severity score identifies the limbs that
 * will be lost - drew its accuracy table with the prevalence note alone. The
 * test was printed only in the Analysis Map, so the table in the results
 * chapter could not say where its numbers came from.
 */

const shapes = [
  ["IDA-PREG", idaPreg],
  ["elastography", elastography],
  ["a cohort asking about associations", vishal],
] as const;

describe.each(shapes)("footnotes, %s", (_name, facts) => {
  const build = buildSap(facts);

  it("names the unadjusted test in the footnote of the table that reports it", () => {
    for (const row of build.analysis) {
      if (!row.unadjusted?.table) continue;
      const table = build.tables.find((t) => t.number === row.unadjusted!.table)!;
      // A row that runs no test at single visits says so in its own words:
      // "Descriptive at each visit, with no p value" in the map and "descriptive
      // only - no test at single time points" under the table. Nothing is lost.
      if (/with no p value$/.test(row.unadjusted.test)) {
        expect(table.footnote, `${row.objective} T${table.number}`).toMatch(/^descriptive only/);
        continue;
      }
      expect(table.footnote, `${row.objective} T${table.number}`).toContain(row.unadjusted.test);
      if (row.unadjusted.fallback) {
        expect(table.footnote, `${row.objective} fallback`).toContain(row.unadjusted.fallback);
      }
    }
  });

  it("names the adjusted model in the footnote of the table that reports it", () => {
    for (const row of build.analysis) {
      if (!row.adjusted?.table) continue;
      const table = build.tables.find((t) => t.number === row.adjusted!.table)!;
      expect(table.footnote, `${row.objective} T${table.number}`).toContain(row.adjusted.model);
      if (row.adjusted.fallback) {
        expect(table.footnote, `${row.objective} fallback`).toContain(row.adjusted.fallback);
      }
    }
  });
});
