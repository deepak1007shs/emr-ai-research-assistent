import { describe, expect, it } from "vitest";
import plans from "./real-plans.json" with { type: "json" };
import { buildAnalyticTables, mergeTables } from "./blocks.ts";
import { assignSlots } from "./slots.ts";
import { validateTables } from "./validate.ts";
import type { SapRegistry } from "../sap/types.ts";
import type { ShellTable, ShellTablesSpec } from "./types.ts";

/**
 * The five plans this application has actually produced.
 *
 * Every other test here runs on a fixture written to exercise a rule. These are
 * the real thing, reduced to the fields the layout depends on and checked in,
 * because the fixtures said the merge was finished and the real plans said four
 * of five documents had errors in them:
 *
 *   a repeated measure that still came out as an estimate with no numbers
 *   beside it; a guard reading only columns and so reporting tables that carry
 *   every estimate as carrying none; two analyses of one outcome called a
 *   duplicate; a whole design given no outcome tables at all because the
 *   catalogue was read as a licence rather than a floor; a descriptive analysis
 *   no table reported; and seven sensitivity tables in one document.
 *
 * Five designs between them, which is the point: a fixture is one design and
 * the four that broke were the other four.
 */

const STUDIES = plans as unknown as Record<string, SapRegistry>;

/** The pipeline a real build runs, minus the half the model writes. */
function layOut(sap: SapRegistry): ShellTablesSpec {
  const groups = ["Group A", "Group B"];
  const described: ShellTable[] = [
    {
      number: 0,
      block: "descriptive",
      role: "descriptive",
      slot: "A1",
      title: `Baseline characteristics (n = ${sap.sample_size ?? 0})`,
      columns: ["Variable", ...groups, "Total"],
      rows: [{ label: "Age", kind: "variable" }],
    },
  ];
  return {
    title: sap.title,
    groups,
    labels: Object.fromEntries([
      ...(sap.variables ?? []).map((v) => [v.id, v.label]),
      ...(sap.outcomes ?? []).map((o) => [o.id, o.what]),
      ...(sap.objectives ?? []).map((o) => [o.id, o.question]),
    ]),
    tables: assignSlots(
      mergeTables(described, buildAnalyticTables(sap, groups), sap),
      (sap.objectives ?? []).map((o) => o.id),
    ),
  };
}

/**
 * How many tables each study lays out.
 *
 * Recorded so a regression shows as a number that moved rather than as a guard
 * nobody can explain. Mahendra is the one to watch: it was eleven tables of
 * which seven were sensitivity analyses, because its design does not list
 * `outcome` in the catalogue and the catalogue was gating rather than adding.
 */
const EXPECTED: Record<string, number> = {
  mahendra: 19,
  manju: 12,
  naveen: 9,
  satyanarayana: 15,
  subhani: 12,
};

describe("the five plans this application has produced", () => {
  it("has one of each design worth having", () => {
    const designs = Object.values(STUDIES).map((s) => s.design_family);
    expect(new Set(designs).size).toBeGreaterThanOrEqual(4);
    expect(Object.keys(STUDIES).sort()).toEqual(Object.keys(EXPECTED).sort());
  });

  for (const [name, sap] of Object.entries(STUDIES)) {
    describe(name, () => {
      it("lays out without throwing, and lays out something", () => {
        const spec = layOut(sap);
        expect(spec.tables.length).toBe(EXPECTED[name]);
      });

      it("passes every guard", () => {
        const { findings } = validateTables(layOut(sap), sap);
        expect(
          findings.filter((f) => f.severity === "ERROR"),
          JSON.stringify(
            findings.filter((f) => f.severity === "ERROR"),
            null,
            2,
          ),
        ).toEqual([]);
      });

      it("reports every analysis the plan declares", () => {
        // The failure this caught: an objective whose only analysis was
        // descriptive got no table, because the outcome table returned null for
        // a comparison of "descriptive" and nothing else covered it.
        const spec = layOut(sap);
        const reported = new Set(spec.tables.flatMap((t) => t.fills ?? []));
        for (const analysis of sap.analyses ?? []) {
          for (const id of analysis.objective_ids ?? []) {
            expect(reported.has(id), `${name}: nothing reports ${id}`).toBe(true);
          }
        }
      });

      it("names a test on every table that compares something", () => {
        // The baseline table and the participant-flow table compare nothing,
        // and neither does an outcome table whose job is "overall": one group,
        // described.
        const NO_TEST = new Set(["descriptive", "flow"]);
        for (const table of layOut(sap).tables) {
          if (NO_TEST.has(table.role)) continue;
          if (table.job?.startsWith("overall")) continue;
          expect(table.test_applied, `${name}: table ${table.number}`).toBeTruthy();
        }
      });

      it("says what fills a cell wherever it lays the groups across the top", () => {
        for (const table of layOut(sap).tables) {
          if (table.role !== "outcome") continue;
          const grouped = table.columns.includes("Total");
          if (grouped) expect(table.reported_as, `table ${table.number}`).toBeTruthy();
        }
      });

      it("builds at most one sensitivity table and one subgroup table", () => {
        // Both repeat the study's primary analysis, and neither is powered.
        // Mahendra printed seven sensitivity tables: the rule was written in a
        // comment and enforced only for the subgroup beside it.
        const spec = layOut(sap);
        for (const role of ["sensitivity", "subgroup"] as const) {
          expect(
            spec.tables.filter((t) => t.role === role).length,
            `${name}: ${role}`,
          ).toBeLessThanOrEqual(1);
        }
      });
    });
  }
});

/**
 * What the five plans caught that the fixtures could not.
 *
 * Each of these was found by rendering the real documents and reading them,
 * after every fixture test passed.
 */
describe("defects the real documents showed", () => {
  const layAll = () => Object.entries(STUDIES).map(([name, sap]) => [name, layOut(sap)] as const);

  it("gives no two tables the same title", () => {
    // "See Table 5" named two different tables in one document: a score
    // reported as a median and again as the proportion above its threshold,
    // and two predictor hunts over different variable sets.
    for (const [name, spec] of layAll()) {
      const titles = spec.tables.map((t) => t.title);
      const duplicated = [...new Set(titles.filter((t, i) => titles.indexOf(t) !== i))];
      expect(duplicated, `${name}`).toEqual([]);
    }
  });

  it("prints no machine token where a reader expects English", () => {
    // One plan set test_override to "descriptive_cross_tabulation_only",
    // meaning it had no test to name, and chooseTest honoured it verbatim into
    // a column header: "Crude descriptive_cross_tabulation_only (95% CI)".
    for (const [name, spec] of layAll()) {
      for (const table of spec.tables) {
        const printed = [table.title, table.test_applied, table.footnote, table.reported_as]
          .concat(table.columns)
          .concat(table.rows.map((r) => r.label))
          .join(" ");
        expect(printed.match(/\b[a-z0-9]+(_[a-z0-9]+)+\b/g), `${name}: table ${table.number}`)
          .toBeNull();
      }
    }
  });

  it("gives no two tables the same slot", () => {
    // One study's primary objective covers eleven outcomes. All eleven were
    // stamped B1, so the document carried eleven sections headed
    // "B1 - Primary outcome" and none of them could be cited.
    for (const [name, spec] of layAll()) {
      const slots = spec.tables.map((t) => t.slot).filter(Boolean);
      const duplicated = [...new Set(slots.filter((s, i) => slots.indexOf(s) !== i))];
      expect(duplicated, `${name}`).toEqual([]);
    }
  });

  it("numbers a primary block of many outcomes, and leaves one alone", () => {
    const many = layOut(STUDIES.mahendra).tables.filter((t) => t.slot?.startsWith("B1"));
    expect(many.length).toBeGreaterThan(1);
    expect(many.map((t) => t.slot)).toEqual(many.map((_, i) => `B1.${i + 1}`));

    // The ordinary study keeps the plain B1 a reader already knows.
    expect(layOut(STUDIES.subhani).tables.some((t) => t.slot === "B1")).toBe(true);
  });

  it("closes the primary block with the sensitivity analysis, not the middle", () => {
    // It carries the primary outcome's id, so ordering by outcome put it
    // between the first and second of eleven primary outcome tables.
    for (const [name, spec] of layAll()) {
      const primary = spec.tables.filter((t) => t.block === "primary");
      const sensitivity = primary.findIndex((t) => t.role === "sensitivity");
      if (sensitivity === -1) continue;
      const lastOutcome = primary.map((t) => t.role).lastIndexOf("outcome");
      expect(sensitivity, `${name}`).toBeGreaterThan(lastOutcome);
    }
  });

  it("says which analysis a plan could not name a test for", () => {
    // A combination the rule table has no row for used to leave the line off
    // the document, which reads as a table nobody thought about.
    const mahendra = layOut(STUDIES.mahendra);
    const todo = mahendra.tables.filter((t) => t.test_applied?.startsWith("TODO:"));
    expect(todo.length).toBeGreaterThan(0);
    for (const table of todo) {
      // Said in words, not by printing the enum at a reader.
      expect(table.test_applied).not.toMatch(/single_group|two_groups|time_to_event/);
    }
  });
});
