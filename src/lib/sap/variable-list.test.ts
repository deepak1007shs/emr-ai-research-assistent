import { describe, expect, it } from "vitest";
import { buildSap } from "./build.ts";
import { renderSapMarkdown } from "./markdown.ts";
import { variableRows, VARIABLE_HEADINGS } from "./variable-list.ts";
import { idaPreg } from "../facts/fixture.ts";
import { elastography } from "../facts/fixture-diagnostic.ts";

/**
 * Section 2 is printed, and prints what Step 2 built.
 *
 * The list was built, read by every step after it and policed by six checks,
 * and rendered by nothing: the plan an investigator downloaded had objectives,
 * a map and tables, and nowhere said what the study measures. These tests are
 * over both a trial and a diagnostic study, because a section that prints only
 * the shape it was written against is the failure `shapes.test.ts` records.
 */

const shapes = [
  ["IDA-PREG", idaPreg],
  ["elastography", elastography],
] as const;

describe.each(shapes)("the master variable list, %s", (_name, facts) => {
  const build = buildSap(facts);
  const rows = variableRows(build);

  it("has a row for every variable Step 2 built, and no other", () => {
    expect(rows).toHaveLength(build.variables.length);
    expect(rows.map((row) => row[0])).toEqual(build.variables.map((v) => v.label));
  });

  it("gives every row all seven columns", () => {
    for (const row of rows) expect(row).toHaveLength(VARIABLE_HEADINGS.length);
  });

  it("says what every row serves, because a row serving nothing is deleted", () => {
    // Rule 2.11. A raw input serves through the value calculated from it, so
    // "none" here is either a row that should not be on the list or a trace
    // that cannot find its way back to an objective.
    for (const row of rows) expect(row[5], row[0]).not.toBe("none");
  });

  it("gives every categorical row its options and every numerical row its unit", () => {
    // Rule 2.6, and the same ground S2-4 checks. Printing the list is what
    // makes that check answerable by a reader rather than only by the code.
    for (const variable of build.variables) {
      if (variable.type === "text" || variable.type === "date") continue;
      const row = rows.find((r) => r[0] === variable.label);
      expect(row?.[3], variable.label).not.toBe("-");
    }
  });

  it("names the inputs of every derived row, and each input is itself a row", () => {
    // Rule 2.8. Listing the derived value without its raw parts is the mistake
    // that makes the CRF unbuildable.
    const labels = new Set(rows.map((row) => row[0]));
    for (const variable of build.variables) {
      if (!variable.derived_from.length) continue;
      const row = rows.find((r) => r[0] === variable.label);
      expect(row?.[6], variable.label).not.toBe("-");
      for (const input of variable.derived_from) {
        const inputLabel = build.variables.find((v) => v.name === input)?.label;
        expect(inputLabel && labels.has(inputLabel), `${variable.label} <- ${input}`).toBe(true);
      }
    }
  });

  it("makes a raw row serve every objective the value built from it serves", () => {
    // Haemoglobin answers P1a in its own right; the change from baseline built
    // from it answers E1, and the two readings are the only capture E1 has. A
    // row that names only its own objectives understates what it is collected
    // for, and the CRF is built from these raw rows.
    for (const derived of build.variables) {
      if (!derived.derived_from.length) continue;
      const owed = Object.keys(derived.roles)
        .filter((key) => key !== "study")
        .map((key) => key.replace(/^adjust:/, ""));
      for (const input of derived.derived_from) {
        const label = build.variables.find((v) => v.name === input)?.label;
        const serves = rows.find((r) => r[0] === label)?.[5] ?? "";
        for (const id of owed) {
          expect(serves.split(", "), `${label} feeds ${derived.label}`).toContain(id);
        }
      }
    }
  });

  it("prints words, never the names code uses", () => {
    // The house rule, given against a plan that printed
    // `amputation_primary_or_secondary_of_the_injured_extremity`.
    for (const row of rows) {
      for (const cell of row) expect(cell, row[0]).not.toMatch(/[a-z]_[a-z]/);
    }
  });

  it("reaches the document, between the objectives and the map", () => {
    const text = renderSapMarkdown(build);
    const at = text.indexOf("## Section 2 - Master Variable List");
    expect(at).toBeGreaterThan(text.indexOf("## Section 1"));
    expect(at).toBeLessThan(text.indexOf("## Analysis Map"));
    for (const row of rows) expect(text).toContain(`| ${row[0]} |`);
  });
});
