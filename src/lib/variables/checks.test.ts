import { describe, expect, it } from "vitest";
import { idaPreg } from "../facts/fixture.ts";
import type { Variable } from "../study/types.ts";
import { buildObjectives } from "../objectives/build.ts";
import { buildVariables } from "./build.ts";
import { step2Checks } from "./checks.ts";

const objectives = buildObjectives(idaPreg);
const base = () => buildVariables(idaPreg, objectives).variables;
const run = (variables: Variable[]) =>
  step2Checks(idaPreg, objectives, variables);
const said = (variables: Variable[], id: string) =>
  run(variables).find((r) => r.id === id)!;

describe("Step 2 checks", () => {
  it("passes every check on the worked example", () => {
    expect(run(base()).filter((r) => !r.pass)).toEqual([]);
  });

  it("S2-1 catches an outcome with no variable", () => {
    const without = base().filter((v) => v.name !== "anaemia_corrected");
    expect(said(without, "S2-1").pass).toBe(false);
    expect(said(without, "S2-1").failing).toEqual(["anaemia_corrected"]);
  });

  it("S2-2 catches a covariate nothing collects", () => {
    const without = base().filter((v) => v.name !== "gestational_age");
    expect(said(without, "S2-2").pass).toBe(false);
  });

  it("S2-3 catches a recipe whose input is not on the list", () => {
    const broken = base().map((v) =>
      v.name === "change_in_haemoglobin"
        ? { ...v, derived_from: ["haemoglobin_baseline"] }
        : v,
    );
    expect(said(broken, "S2-3").pass).toBe(false);
  });

  it("S2-3 catches a variable that says it is derived and says nothing more", () => {
    const vague = base().map((v) =>
      v.name === "age" ? { ...v, recipe: "Calculated from the date of birth" } : v,
    );
    expect(said(vague, "S2-3").failing).toEqual(["age"]);
  });

  it("S2-4 catches a category list of one, not only an empty one", () => {
    // The shape this arrives in: an outcome whose unit was prose, split on a
    // separator that was not there, leaving a single category.
    const oneSided = base().map((v) =>
      v.name === "anaemia_corrected" ? { ...v, options: ["Yes"] } : v,
    );
    expect(said(oneSided, "S2-4").pass).toBe(false);
    expect(said(oneSided, "S2-4").failing).toEqual(["anaemia_corrected"]);
  });

  it("S2-4 catches a number with no unit", () => {
    const unitless = base().map((v) =>
      v.name === "serum_ferritin" ? { ...v, unit: null } : v,
    );
    expect(said(unitless, "S2-4").pass).toBe(false);
  });

  it("S2-5 catches a variable that answers nothing", () => {
    const spare: Variable = {
      name: "blood_group", label: "Blood group", roles: {}, type: "nominal",
      unit: null, options: ["A", "B", "AB", "O"], timepoints: ["D0"],
      derived_from: [], recipe: null, crf: true, source: "protocol",
    };
    expect(said([...base(), spare], "S2-5").failing).toEqual(["blood_group"]);
  });

  it("S2-5 catches a role pointing at an objective that does not exist", () => {
    const orphan = base().map((v) =>
      v.name === "age" ? { ...v, roles: { "adjust:S9": "covariate" as const } } : v,
    );
    expect(said(orphan, "S2-5").failing).toEqual(["age"]);
  });
});
