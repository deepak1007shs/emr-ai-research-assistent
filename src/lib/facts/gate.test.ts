import { describe, expect, it } from "vitest";
import { gateA, gateAPasses } from "./gate.ts";
import { idaPreg } from "./fixture.ts";
import type { FactsSheet } from "../study/types.ts";

const said = (facts: FactsSheet, id: string) =>
  gateA(facts).find((r) => r.id === id)!;

describe("Gate A", () => {
  it("lets a protocol through whose design and primary outcome are settled", () => {
    expect(gateAPasses(idaPreg)).toBe(true);
    for (const result of gateA(idaPreg)) expect(result.pass, result.id).toBe(true);
  });

  it("refuses a design that is only a timing word", () => {
    // The commonest design label in a thesis protocol. A prospective study can
    // be a trial, a cohort or a case series, and each owes different tables.
    for (const label of [
      "prospective study",
      "A prospective, observational study",
      "retrospective analysis",
      "comparative study",
    ]) {
      const result = said({ ...idaPreg, design_label: label }, "G-A1");
      expect(result.pass, label).toBe(false);
      expect(result.message).toContain("when the data were collected");
    }
  });

  it("refuses a design whose guideline is not the one it owes", () => {
    const result = said({ ...idaPreg, guideline: "STROBE" }, "G-A1");
    expect(result.pass).toBe(false);
    expect(result.message).toContain("CONSORT");
  });

  it("refuses a primary outcome with any link of its chain missing", () => {
    for (const [field, gap] of [
      ["what", "what is measured"],
      ["how", "how it is measured"],
      ["instrument", "the instrument"],
      ["unit", "the unit"],
    ] as const) {
      const facts = { ...idaPreg, primary: { ...idaPreg.primary, [field]: "  " } };
      const result = said(facts, "G-A2");
      expect(result.pass, field).toBe(false);
      expect(result.message).toContain(gap);
    }
  });

  it("refuses a primary outcome with no time point", () => {
    const facts = { ...idaPreg, primary: { ...idaPreg.primary, time: [] } };
    expect(said(facts, "G-A2").pass).toBe(false);
  });

  it("refuses a comparison whose groups are not both named", () => {
    const one = { ...idaPreg, groups: [idaPreg.groups[0]] };
    expect(said(one, "G-A3").pass).toBe(false);
    expect(said(one, "G-A3").message).toContain("what is being compared");

    const unnamed = {
      ...idaPreg,
      groups: [idaPreg.groups[0], { code: "ORAL", label: "  " }],
    };
    expect(said(unnamed, "G-A3").pass).toBe(false);
  });

  it("asks no groups of a study that compares nothing", () => {
    // A single-group descriptive study has no arms to name, and demanding two
    // would refuse a study that is perfectly well specified.
    const single: FactsSheet = {
      ...idaPreg,
      design: "descriptive_epidemiology",
      design_label: "single-group cross-sectional prevalence survey",
      guideline: "STROBE",
      frame: "PECO",
      groups: [],
      secondary: [],
    };
    expect(said(single, "G-A3").pass).toBe(true);
  });

  it("refuses a secondary outcome with no time point, not only the primary", () => {
    const facts = {
      ...idaPreg,
      secondary: [{ ...idaPreg.secondary[0], time: [] }, ...idaPreg.secondary.slice(1)],
    };
    const result = said(facts, "G-A3");
    expect(result.pass).toBe(false);
    expect(result.message).toContain("Anaemia corrected");
  });
});
