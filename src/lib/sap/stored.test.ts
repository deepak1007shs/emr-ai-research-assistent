import { describe, expect, it } from "vitest";
import { buildableFromReading, planColumns } from "./stored.ts";
import { idaPreg } from "../facts/fixture.ts";
import { renderSapMarkdown } from "./markdown.ts";
import { buildSap } from "./build.ts";

describe("a plan from a reading already stored", () => {
  it("is the plan a build from the same reading makes", () => {
    const columns = planColumns(idaPreg);
    expect(columns.markdown).toBe(renderSapMarkdown(buildSap(idaPreg)));
    expect(columns.pinned).toEqual({ tables: 16, fits: 4, figures: 1 });
    expect("facts" in columns.plan).toBe(false);
  });

  // A thesis on bile duct injury, 14 Sep 2026: stopped at Gate A for a unit its
  // nominal outcome could not have, and after that rule was corrected there was
  // no way to build its plan but to pay to read the protocol again.
  it("is offered for a reading stopped at Gate A that passes it now", () => {
    const nominal = { ...idaPreg, primary: { ...idaPreg.primary, type: "nominal" as const, unit: "" } };
    expect(buildableFromReading({ status: "failed", plan: null, facts: nominal })).toBe(true);
  });

  it("is not offered for a reading that still fails Gate A", () => {
    const unitless = { ...idaPreg, primary: { ...idaPreg.primary, unit: "" } };
    expect(buildableFromReading({ status: "failed", plan: null, facts: unitless })).toBe(false);
  });

  it("is not offered for a row with a plan, a row still building, or no reading", () => {
    expect(buildableFromReading({ status: "ready", plan: { tables: [] }, facts: idaPreg })).toBe(false);
    expect(buildableFromReading({ status: "ready", plan: null, facts: null })).toBe(false);
    expect(buildableFromReading({ status: "failed", plan: null, facts: null })).toBe(false);
  });
});
