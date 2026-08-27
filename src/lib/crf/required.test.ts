import { describe, expect, it } from "vitest";
import { requiredDerived, requiredFields, requiredVisits } from "./required.ts";
import { mergeSections } from "./build.ts";
import type { SapRegistry } from "../sap/types.ts";
import type { CrfSection } from "./types.ts";

/**
 * Not less, not extra.
 *
 * Shaped after the trial that showed the old form up: thirteen outcomes, six
 * questionnaire subscales, and a form that stopped at the operating table. Each
 * test is named for the thing that went wrong.
 */
function plan(): SapRegistry {
  return {
    title: "A surgical trial",
    objectives: [
      { id: "P1", tier: "primary", question: "Does the wider operation cause more complications?" },
      { id: "S1", tier: "secondary", question: "Does quality of life differ at 30 days?" },
    ],
    variables: [
      { id: "var_arm", label: "Trial arm", data_type: "binary", unit_coding: "Wide / Standard", role: "predictor" },
      { id: "var_asa", label: "ASA grade", data_type: "ordinal", unit_coding: "I / II / III / IV", role: "confounder" },
      { id: "var_cd_grade", label: "Clavien-Dindo grade", data_type: "ordinal", unit_coding: "I / II / IIIa / IIIb / IVa / IVb / V", role: "outcome", timepoints: ["30 days after surgery"] },
      // The questionnaire: a score computed from its items, never collected.
      { id: "var_qol_gi", label: "QLQ-OV28 gastrointestinal score", data_type: "continuous", unit_coding: "0-100", role: "outcome", timepoints: ["baseline", "30 days after surgery"], derived_from: ["var_qol_item_31", "var_qol_item_32"] },
      { id: "var_qol_item_31", label: "QLQ-OV28 item 31", data_type: "ordinal", unit_coding: "1 / 2 / 3 / 4", role: "outcome", timepoints: ["baseline", "30 days after surgery"] },
      { id: "var_qol_item_32", label: "QLQ-OV28 item 32", data_type: "ordinal", unit_coding: "1 / 2 / 3 / 4", role: "outcome", timepoints: ["baseline", "30 days after surgery"] },
      { id: "var_age", label: "Age", data_type: "continuous", unit_coding: "Years", role: "descriptor" },
      { id: "var_never_used", label: "A variable nothing analyses", data_type: "binary", unit_coding: "Yes / No", role: "descriptor" },
    ],
    outcomes: [
      { id: "out_complication", what: "Perioperative complications", how: "from the record", instrument: "Clavien-Dindo", when: "30 days after surgery", units: "grade", domain: "clinical", source_variable_ids: ["var_cd_grade"] },
      { id: "out_qol", what: "Quality of life", how: "questionnaire", instrument: "QLQ-OV28", when: "30 days after surgery", units: "0-100", domain: "patient_reported", source_variable_ids: ["var_qol_gi"] },
    ],
    analyses: [
      { objective_ids: ["P1"], label: "P1 - complications", outcome_ids: ["out_complication"], exposure_ids: ["var_arm"], adjust_for_ids: ["var_asa"], data_type: "ordinal", comparison: "two_groups", pairing: "none", table_ids: ["T1"] },
      { objective_ids: ["S1"], label: "S1 - quality of life", outcome_ids: ["out_qol"], exposure_ids: ["var_arm"], adjust_for_ids: [], data_type: "continuous", comparison: "two_groups", pairing: "none", table_ids: ["T2"] },
    ],
  };
}

const ids = (sap: SapRegistry) => requiredFields(sap).map((f) => f.variable_id);

describe("what the form must collect", () => {
  it("a questionnaire score is not collected; its items are", () => {
    const required = ids(plan());
    expect(required).not.toContain("var_qol_gi");
    expect(required).toContain("var_qol_item_31");
    expect(required).toContain("var_qol_item_32");
  });

  it("and the score is listed as calculated, naming its items", () => {
    const derived = requiredDerived(plan());
    expect(derived).toEqual([
      {
        variable_id: "var_qol_gi",
        label: "QLQ-OV28 gastrointestinal score",
        from_variable_ids: ["var_qol_item_31", "var_qol_item_32"],
      },
    ]);
  });

  it("every outcome, exposure and confounder is required", () => {
    const required = ids(plan());
    for (const id of ["var_cd_grade", "var_arm", "var_asa"]) expect(required).toContain(id);
  });

  it("a descriptor is required too, because the baseline table describes it", () => {
    expect(ids(plan())).toContain("var_age");
  });

  it("each required field says why the form owes it", () => {
    const asa = requiredFields(plan()).find((f) => f.variable_id === "var_asa")!;
    expect(asa.because).toContain("P1");
    expect(asa.because).toContain("holds it constant");
    const item = requiredFields(plan()).find((f) => f.variable_id === "var_qol_item_31")!;
    expect(item.because).toContain("computed from it");
  });

  it("the visits come from the plan, so a follow-up section has to exist", () => {
    const visits = requiredVisits(plan());
    expect(visits).toContain("baseline");
    expect(visits).toContain("30 days after surgery");
  });

  it("a variable nothing analyses is still described, never silently dropped", () => {
    // It is a descriptor, so it is required; "not extra" is judged against the
    // plan, and a plan carrying a variable nothing uses is the plan's problem.
    expect(ids(plan())).toContain("var_never_used");
  });

  it("a plan with nothing derived asks for no calculated values", () => {
    const sap = plan();
    sap.variables = sap.variables.filter((v) => !v.derived_from);
    sap.outcomes = sap.outcomes.filter((o) => o.id !== "out_qol");
    sap.analyses = sap.analyses.filter((a) => !a.objective_ids.includes("S1"));
    expect(requiredDerived(sap)).toEqual([]);
  });
});

describe("folding the second pass into the first", () => {
  const section = (title: string, ids: string[]): CrfSection => ({
    letter: "",
    title,
    fields: ids.map((id) => ({ variable_id: id, label: id, type: "Number" as const })),
  });

  it("adds to a section that already exists rather than repeating it", () => {
    const merged = mergeSections(
      [section("Baseline", ["var_age"])],
      [section("baseline", ["var_asa"])],
    );
    expect(merged).toHaveLength(1);
    expect(merged[0].fields.map((f) => f.variable_id)).toEqual(["var_age", "var_asa"]);
  });

  it("appends a section the form did not have", () => {
    const merged = mergeSections(
      [section("Baseline", ["var_age"])],
      [section("Day 30 follow-up", ["var_cd_grade"])],
    );
    expect(merged.map((s) => s.title)).toEqual(["Baseline", "Day 30 follow-up"]);
  });

  it("never collects the same field twice", () => {
    const merged = mergeSections(
      [section("Baseline", ["var_age"])],
      [section("Baseline", ["var_age", "var_asa"])],
    );
    expect(merged[0].fields.map((f) => f.variable_id)).toEqual(["var_age", "var_asa"]);
  });

  it("re-letters the form so it still reads A, B, C", () => {
    const merged = mergeSections(
      [section("One", ["a"]), section("Two", ["b"])],
      [section("Three", ["c"])],
    );
    expect(merged.map((s) => s.letter)).toEqual(["A", "B", "C"]);
  });
});
