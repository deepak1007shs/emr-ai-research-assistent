import { describe, expect, it } from "vitest";
import { buildSap } from "./build.ts";
import { renderSapMarkdown } from "./markdown.ts";
import { MAP_DETAIL_LINE, MAP_HEADINGS, mapRows, unitLine } from "./analysis-map.ts";
import { idaPreg } from "../facts/fixture.ts";
import { elastography } from "../facts/fixture-diagnostic.ts";
import { vishal } from "../facts/fixture-vishal.ts";

/**
 * The simple Analysis Map: one line per cell, one question per column.
 *
 * Over a trial, a diagnostic study and an association cohort, because a
 * layout written against the worked example is the failure `shapes.test.ts`
 * records.
 */

const shapes = [
  ["IDA-PREG", idaPreg],
  ["elastography", elastography],
  ["a cohort asking about associations", vishal],
] as const;

const OBJECTIVE = 0, OUTCOME = 1, PREDICTORS = 2, UNADJUSTED = 3, ADJUSTED = 4, TABLE = 5;

describe.each(shapes)("the Analysis Map, %s", (_name, facts) => {
  const build = buildSap(facts);
  const rows = mapRows(build);

  it("has six columns, in the order chosen", () => {
    expect(MAP_HEADINGS).toEqual(["Objective", "Outcome", "Predictor(s)", "Unadjusted", "Adjusted for", "Table"]);
    for (const row of rows) expect(row).toHaveLength(6);
  });

  it("answers each objective in its own row, in the order of the plan", () => {
    expect(rows.map((r) => r[OBJECTIVE].split(" - ")[1])).toEqual(build.analysis.map((a) => a.objective));
  });

  it("prints the short name of every test and model, never the sentence", () => {
    build.analysis.forEach((a, i) => {
      if (a.unadjusted) expect(rows[i][UNADJUSTED]).toBe(a.unadjusted.short);
      else expect(rows[i][UNADJUSTED]).toBe("None");
      if (a.adjusted) {
        expect(rows[i][ADJUSTED].startsWith(a.adjusted.short!), a.objective).toBe(true);
        if (a.adjusted.fallback) expect(rows[i][ADJUSTED]).not.toContain(a.adjusted.fallback);
      }
    });
  });

  it("names every covariate an adjusted model holds constant, by its label", () => {
    build.analysis.forEach((a, i) => {
      for (const c of a.adjusted?.covariates ?? []) {
        const label = build.variables.find((v) => v.name === c.var)?.label ?? c.var;
        expect(rows[i][ADJUSTED], `${a.objective} ${c.var}`).toContain(label);
      }
    });
  });

  it("says why there is no model, where there is none", () => {
    build.analysis.forEach((a, i) => {
      if (a.adjusted) return;
      const cell = rows[i][ADJUSTED];
      if (a.exception) expect(cell, a.objective).toMatch(/^Not applicable: /);
      if (a.exception === "estimation") expect(cell).toBe("Not applicable: estimation only");
      if (a.exception === "safety") expect(cell).toContain("safety outcome");
      if (a.exception === "diagnostic") expect(cell).toContain("a diagnostic question");
      // Never a claim the row cannot make: a correlation is not accuracy, and
      // an exploratory t-test is not a correlation.
      expect(cell, a.objective).not.toMatch(/diagnostic accuracy|: correlation$/);
    });
  });

  it("points every row with an analysis at the tables that report it, and at no fit table", () => {
    const drawn = new Set(build.tables.map((t) => t.number));
    build.analysis.forEach((a, i) => {
      if (!a.unadjusted && !a.adjusted) return;
      const cell = rows[i][TABLE];
      expect(cell, a.objective).not.toBe("None");
      for (const entry of cell.split(", ")) {
        expect(entry, a.objective).toMatch(/^T\d+$/);
        expect(drawn.has(entry.slice(1)), `${a.objective} ${entry}`).toBe(true);
      }
    });
  });

  it("prints words, never the names code uses", () => {
    for (const row of rows) for (const cell of row) expect(cell, row[OBJECTIVE]).not.toMatch(/[a-z]_[a-z]/);
    expect(unitLine(build)).not.toMatch(/[a-z]_[a-z]/);
    for (const row of rows) expect(row[PREDICTORS]).not.toBe("");
  });

  it("says the unit of analysis once, and on a row only where that row differs", () => {
    const line = unitLine(build);
    expect(line).toMatch(/^Unit of analysis: /);
    expect(line).toContain(MAP_DETAIL_LINE);
    build.analysis.forEach((a, i) => {
      const said = line.includes(`${a.unit_of_analysis}, ${a.count}`);
      expect(rows[i][OUTCOME].includes(a.count), a.objective).toBe(!said);
    });
  });

  it("reaches the document in place of the old map", () => {
    const text = renderSapMarkdown(build);
    const map = text.slice(text.indexOf("## Analysis Map"), text.indexOf("## Section 6"));
    expect(map).toContain(`| ${MAP_HEADINGS.join(" | ")} |`);
    expect(map).not.toContain("Unadjusted:");
    expect(map).not.toContain("(fit T");
    for (const row of rows) expect(map).toContain(`| ${row[OBJECTIVE]} |`);
  });
});

describe("a plan stored before short names existed", () => {
  it("prints the whole sentence rather than nothing", () => {
    const build = buildSap(idaPreg);
    const stored = {
      ...build,
      analysis: build.analysis.map((a) => ({
        ...a,
        unadjusted: a.unadjusted ? { ...a.unadjusted, short: undefined } : null,
        adjusted: a.adjusted ? { ...a.adjusted, short: undefined } : null,
      })),
    };
    const rows = mapRows(stored);
    stored.analysis.forEach((a, i) => {
      if (a.unadjusted) expect(rows[i][UNADJUSTED]).toBe(a.unadjusted.test);
      if (a.adjusted) expect(rows[i][ADJUSTED].startsWith(a.adjusted.model)).toBe(true);
    });
  });
});

describe("IDA-PREG's map, read as a person reads it", () => {
  const rows = mapRows(buildSap(idaPreg));
  const row = (id: string) => rows.find((r) => r[OBJECTIVE].endsWith(` - ${id}`))!;

  it("prints the primary as the investigator chose", () => {
    expect(row("P1a")).toEqual([
      "PRIMARY - P1a",
      "Change in haemoglobin (continuous)",
      "Trial arm",
      "Independent t-test",
      "Linear regression (ANCOVA); Haemoglobin, Gestational age",
      "T4, T8",
    ]);
  });

  it("carries the readings of a trajectory beside its outcome", () => {
    expect(row("P1b")[OUTCOME]).toBe("Haemoglobin (continuous; 4 readings per participant)");
  });

  it("says an exploratory two-variable question has no model by design", () => {
    expect(row("E2")[ADJUSTED]).toBe("Not applicable: exploratory, unadjusted only");
  });

  it("names one table where one table reports both halves", () => {
    expect(row("S1")[TABLE]).toBe("T10");
  });
});
