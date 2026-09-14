import { describe, expect, it } from "vitest";
import { buildSap } from "../sap/build.ts";
import { idaPreg } from "../facts/fixture.ts";
import { vishal } from "../facts/fixture-vishal.ts";
import type { FactsSheet } from "../study/types.ts";

/**
 * A number can be computed from what the form collects, and a measurement taken
 * as a pair is recorded whole.
 *
 * Dr Vishal's reading derived the duration of ischaemia - the primary
 * objective's first factor - from the time of injury and the time of
 * revascularisation, both typed as free text with no date beside them: a
 * duration across midnight cannot be computed from that. And the proforma's
 * "BP" became one measure, systolic blood pressure, with no diastolic.
 */

const check = (facts: FactsSheet, id: string) => buildSap(facts).checks.find((c) => c.id === id)!;

// The two readings of one protocol disagree, which is the finding. The fixture
// is the reading of 12 Sep, which typed both times as dates and split "BP" into
// systolic and diastolic. The reading of 14 Sep, which built the form the
// investigator checked, typed both times as text and kept systolic alone. This
// is that reading, reproduced on the fixture.
const read14Sep: FactsSheet = {
  ...vishal,
  measures: vishal.measures
    .filter((m) => m.name !== "diastolic_blood_pressure")
    .map((m) =>
      m.name === "time_of_injury" || m.name === "time_of_revascularization"
        ? { ...m, type: "text" as const }
        : m,
    ),
};

describe("S2-6", () => {
  it("fails a number computed from free text", () => {
    const result = check(read14Sep, "S2-6");
    expect(result.pass).toBe(false);
    expect(result.failing.join(" ")).toContain("time_of_injury");
  });

  it("passes a number computed from numbers or dates", () => {
    // Body mass index from height and weight; the duration of ischaemia from two
    // dates, as the reading of 12 Sep recorded it.
    expect(check(idaPreg, "S2-6").pass).toBe(true);
    expect(check(vishal, "S2-6").pass).toBe(true);
  });
});

describe("S2-7", () => {
  it("warns where blood pressure is recorded as systolic alone", () => {
    const result = check(read14Sep, "S2-7");
    expect(result.pass).toBe(false);
    expect(result.message).toContain("diastolic");
  });

  it("passes where both halves are recorded", () => {
    const measure = (name: string, label: string) => ({
      name, label, type: "continuous" as const, unit: "mmHg", options: null,
      block: "vital signs", derived_from: [], recipe: null,
    });
    const whole = {
      ...idaPreg,
      measures: [
        ...idaPreg.measures,
        measure("systolic_blood_pressure", "Systolic blood pressure"),
        measure("diastolic_blood_pressure", "Diastolic blood pressure"),
      ],
    };
    expect(check(whole, "S2-7").pass).toBe(true);
    expect(check(vishal, "S2-7").pass).toBe(true);
    // A study measuring no blood pressure owes neither half.
    expect(check(idaPreg, "S2-7").pass).toBe(true);
  });
});
