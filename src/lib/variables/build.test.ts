import { describe, expect, it } from "vitest";
import { idaPreg } from "../facts/fixture.ts";
import { buildObjectives } from "../objectives/build.ts";
import { ARM, STUDY, buildVariables } from "./build.ts";
import { variableName } from "./name.ts";

const built = () => buildVariables(idaPreg, buildObjectives(idaPreg));
const find = (name: string) => built().variables.find((v) => v.name === name)!;

describe("Step 2, the master variable list", () => {
  it("lists every measure the study records, and the arm", () => {
    const names = built().variables.map((v) => v.name);
    for (const measure of idaPreg.measures) expect(names).toContain(measure.name);
    expect(names[0]).toBe(ARM);
  });

  it("makes a variable for an outcome that is not itself a measure", () => {
    const change = find("change_in_haemoglobin");
    expect(change.derived_from).toEqual(["haemoglobin"]);
    expect(change.recipe).toBe(
      "Haemoglobin at week 6 minus haemoglobin at day 0",
    );
  });

  it("does not make a second variable for an outcome that is a measure", () => {
    // Adverse effects are recorded directly. A study that listed them twice
    // would collect them once and report them under a name nothing fills.
    const named = built().variables.filter((v) => v.name === "adverse_effects");
    expect(named).toHaveLength(1);
    expect(named[0].crf).toBe(true);
  });

  it("never puts a derived variable on the form", () => {
    for (const variable of built().variables) {
      if (variable.derived_from.length) expect(variable.crf).toBe(false);
    }
  });

  it("dates a change at the end of the window, not at every reading", () => {
    // Its inputs are read four times; the change happens once.
    expect(find("haemoglobin").timepoints).toEqual(["D0", "W2", "W4", "W6"]);
    expect(find("change_in_haemoglobin").timepoints).toEqual(["W6"]);
  });

  it("gives a derived yes-or-no the house wording, in the house order", () => {
    expect(find("anaemia_corrected").options).toEqual(["Yes", "No"]);
    expect(find("anaemia_corrected").unit).toBeNull();
  });

  it("holds one role per objective, not one role for the variable", () => {
    // The case the whole shape of `roles` exists for: haemoglobin is the
    // outcome of the trajectory question, an input of the change, and a
    // covariate of the models that adjust for its baseline.
    const hb = find("haemoglobin");
    expect(hb.roles.P1b).toBe("outcome");
    expect(hb.roles.P1a).toBe("derived");
    expect(hb.roles["adjust:P1a"]).toBe("covariate");
  });

  it("never adjusts a question for its own outcome", () => {
    expect(find("haemoglobin").roles["adjust:P1b"]).toBeUndefined();
  });

  it("gives the exploratory questions their variables too", () => {
    expect(find("gestational_age").roles.E1).toBe("exposure");
    expect(find("change_in_haemoglobin").roles.E1).toBe("outcome");
    // An effect that differs by something is a question about the arm as well.
    expect(find(ARM).roles.E1).toBe("exposure");
    // A correlation is not.
    expect(find(ARM).roles.E2).toBeUndefined();
  });

  it("leaves a variable the study never collects off the form until Step 3", () => {
    expect(find("diet").timepoints).toEqual([]);
    expect(find("diet").source).toBe("protocol");
  });

  it("takes the arm's categories from the groups, in the protocol's order", () => {
    expect(find(ARM).options).toEqual([
      "IV ferric carboxymaltose",
      "Oral ferrous ascorbate",
    ]);
    expect(find(ARM).roles.P1a).toBe("exposure");
  });

  it("gives every variable a role, so none is silently unused", () => {
    for (const variable of built().variables) {
      expect(Object.keys(variable.roles).length).toBeGreaterThan(0);
    }
  });

  it("reads the proforma triage rather than the reason prose", () => {
    expect(find("participant_name").roles[STUDY]).toBe("administrative");
    expect(find("age").roles[STUDY]).toBe("descriptor");
  });

  it("asks rather than invents when an input feeds nothing named", () => {
    // Height and weight are kept "as raw inputs of body mass index" and no
    // variable called body mass index exists. Inventing one would put a row in
    // a table for a number nobody defined.
    const names = built().variables.map((v) => v.name);
    expect(names).not.toContain("body_mass_index");
    expect(built().todos.join(" ")).toContain("Height is kept as a raw input");
  });

  it("flags a measure taken through the study that answers nothing", () => {
    expect(built().todos.join(" ")).toContain("answers no objective");
    // A baseline-only measure is Table 1 material and needs no question asked.
    expect(built().todos.join(" ")).not.toContain("Mean corpuscular volume");
  });

  it("asks the investigator to confirm a covariate nobody wrote down", () => {
    expect(built().todos[0]).toContain("inferred from the design");
  });

  it("names a variable the way Step 1 named it", () => {
    expect(find(variableName(idaPreg.primary.what)).name).toBe(
      "change_in_haemoglobin",
    );
  });
});
