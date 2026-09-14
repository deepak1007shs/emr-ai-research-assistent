import { describe, expect, it } from "vitest";
import { buildSap } from "../sap/build.ts";
import { buildCrf } from "./build.ts";
import { fieldTypeOf, responseFor } from "./response.ts";
import { factsSchema } from "../facts/schema.ts";
import { vishal } from "../facts/fixture-vishal.ts";
import type { FactsSheet } from "../study/types.ts";

/**
 * A time is collected with its date, and a telephone number as digits.
 *
 * Dr Vishal's form asked for the time of injury, the time of revascularisation
 * and a mobile number on lines of free text, because the reading had nowhere
 * else to put them. The duration of ischaemia is computed from the two times.
 */

const retyped: FactsSheet = {
  ...vishal,
  measures: vishal.measures.map((m) =>
    m.name === "time_of_injury" || m.name === "time_of_revascularization"
      ? { ...m, type: "datetime" as const }
      : m.name === "mobile_number"
        ? { ...m, type: "phone" as const }
        : m,
  ),
};
const sap = buildSap(retyped);
const form = buildCrf(sap);
const field = (label: string) => form.fields.find((f) => f.label.startsWith(label))!;

describe("a moment and a telephone number", () => {
  it("are collected as a date with its time, and as digits", () => {
    expect(field("Time of injury").type).toBe("datetime");
    expect(responseFor(field("Time of injury"))).toContain("HH:MM");
    expect(responseFor(field("Time of injury"))).toContain("DD/MM/YYYY");
    expect(field("Mobile number").type).toBe("phone");
    expect(responseFor(field("Mobile number"))).toContain("(digits)");
  });

  it("are not read by CRF-1 as answers somebody filled in", () => {
    const crf1 = form.checks.find((c) => c.id === "CRF-1")!;
    expect(crf1.failing.join(" ")).not.toMatch(/Time of injury|Mobile number/);
  });

  it("let a duration be computed, so S2-6 passes", () => {
    expect(sap.checks.find((c) => c.id === "S2-6")?.pass).toBe(true);
  });

  it("are on the type list the reading is parsed against", () => {
    expect(factsSchema.parse(retyped).measures.find((m) => m.name === "mobile_number")?.type).toBe("phone");
    expect(fieldTypeOf({ ...retyped.measures[0], type: "datetime" } as never, null)).toBe("datetime");
  });
});

describe("the descriptive tables", () => {
  const rows = (facts: FactsSheet) =>
    buildSap(facts).tables.filter((t) => t.kind === "descriptive").flatMap((t) => t.rows);

  it("have no row for a date, a moment or a telephone number", () => {
    for (const row of rows(retyped)) {
      expect(row.label).not.toMatch(/^Time of injury|^Time of revascularization|^Mobile number/);
    }
    for (const row of rows(vishal)) expect(row.label).not.toMatch(/^Time of injury - n/);
  });

  it("do not count free text until somebody says what it is counted as", () => {
    const free = rows(vishal).find((r) => r.label.startsWith("Occupation"))!;
    expect(free.label).toContain("**TODO:**");
    expect(free.label).toContain("free text");
  });
});
