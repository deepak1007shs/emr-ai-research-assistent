import { describe, expect, it } from "vitest";
import { idaPreg } from "../facts/fixture.ts";
import type { FactsSheet } from "../study/types.ts";
import { buildObjectives, buildPicot } from "./build.ts";
import { step1Checks } from "./checks.ts";
import { promisesIn } from "./promises.ts";

const run = (facts: FactsSheet) =>
  step1Checks(facts, buildPicot(facts), buildObjectives(facts));
const said = (facts: FactsSheet, id: string) =>
  run(facts).find((r) => r.id === id)!;

describe("Step 1 checks", () => {
  it("passes every check on the worked example", () => {
    expect(run(idaPreg).filter((r) => !r.pass)).toEqual([]);
  });

  it("S1-1 catches a plan printing a frame the facts did not lock", () => {
    const picot = { ...buildPicot(idaPreg), frame: "PECO" as const };
    const result = step1Checks(idaPreg, picot, buildObjectives(idaPreg)).find(
      (r) => r.id === "S1-1",
    )!;
    expect(result.pass).toBe(false);
  });

  it("S1-2 catches an objective with no comparison", () => {
    const objectives = buildObjectives(idaPreg).map((o) =>
      o.id === "S1" ? { ...o, comparison: "" } : o,
    );
    const result = step1Checks(idaPreg, buildPicot(idaPreg), objectives).find(
      (r) => r.id === "S1-2",
    )!;
    expect(result.pass).toBe(false);
    expect(result.failing).toEqual(["S1"]);
  });

  it("S1-3 catches a title promising a rate the plan never asks about", () => {
    // The case the whole list exists for: haemoglobin read twice instead of
    // four times. The title still says "rise", and the plan can no longer
    // answer it, and the two documents look identical on the page.
    const twice: FactsSheet = {
      ...idaPreg,
      primary: { ...idaPreg.primary, time: ["D0", "W6"] },
    };
    expect(promisesIn(twice.title).map((p) => p.id)).toContain("trajectory");
    expect(said(twice, "S1-3").pass).toBe(false);
    expect(said(twice, "S1-3").failing).toEqual(["trajectory"]);
  });

  it("S1-3 is satisfied by a question waiting for the investigator", () => {
    const twice: FactsSheet = {
      ...idaPreg,
      primary: { ...idaPreg.primary, time: ["D0", "W6"] },
      open_items: [
        ...idaPreg.open_items,
        "The title promises a rise in haemoglobin. Confirm whether the rate of change is to be analysed, which needs a reading at weeks 2 and 4.",
      ],
    };
    expect(said(twice, "S1-3").pass).toBe(true);
  });

  it("S1-3 catches a title claiming an analysis the design cannot support", () => {
    const facts: FactsSheet = {
      ...idaPreg,
      title: "Diagnostic accuracy of serum ferritin in pregnancy",
    };
    expect(said(facts, "S1-3").failing).toEqual(["accuracy"]);
  });

  it("S1-4 catches a repeated outcome asked only how far it moved", () => {
    const objectives = buildObjectives(idaPreg).filter((o) => o.id !== "P1b");
    const result = step1Checks(idaPreg, buildPicot(idaPreg), objectives).find(
      (r) => r.id === "S1-4",
    )!;
    expect(result.pass).toBe(false);
    expect(result.failing).toEqual(["Change in haemoglobin"]);
  });
});
