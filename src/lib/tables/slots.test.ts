import { describe, expect, it } from "vitest";
import { assignSlots, descriptiveSlots, loadSlots, slotTitle } from "./slots.ts";
import { buildAnalyticTables, mergeTables } from "./blocks.ts";
import { validateTables } from "./validate.ts";
import { sapFixture } from "../sap/fixture.ts";
import { tablesFixture } from "./fixture.ts";
import type { ShellTable, ShellTablesSpec } from "./types.ts";
import type { SapSpec } from "../sap/types.ts";

/**
 * The house skeleton.
 *
 * The slot is not the table's number: a reader cites "Table 7", and the slot
 * above it says which part of the skeleton they are in. Its job is to make a
 * missing part visible, so these tests are as much about what is absent as
 * about what is there.
 */

describe("the skeleton", () => {
  it("names the flow table and seven descriptive slots, in order", () => {
    expect(descriptiveSlots().map((s) => s.slot)).toEqual([
      "A0", "A1", "A2", "A3", "A4", "A5", "A6", "A7",
    ]);
    for (const slot of loadSlots()) {
      expect(slot.title, slot.slot).toBeTruthy();
      expect(slot.holds.length, `${slot.slot} does not say what it holds`).toBeGreaterThan(30);
    }
  });

  it("gives every analytic role a slot code can work out", () => {
    for (const role of ["outcome", "effect_adjusted", "sensitivity", "subgroup"]) {
      expect(loadSlots().some((s) => s.role === role), role).toBe(true);
    }
  });

  it("reads a title for a numbered slot from its pattern", () => {
    expect(slotTitle("B1")).toBe("Primary outcome");
    expect(slotTitle("C2.1")).toBe("Secondary outcome");
    expect(slotTitle("D3")).toBe("Exploratory analysis");
    expect(slotTitle(undefined)).toBeNull();
  });
});

describe("stamping the slot on a study", () => {
  const built = () => {
    const sap = sapFixture as SapSpec;
    return assignSlots(
      mergeTables(
        [{ ...tablesFixture.tables[0] }, { ...tablesFixture.tables[1] }],
        buildAnalyticTables(sap, tablesFixture.groups),
        sap,
      ),
      sap.objectives.map((o) => o.id),
    );
  };

  it("keeps the slot the writer chose for a baseline table", () => {
    const descriptive = built().filter((t) => t.block === "descriptive");
    expect(descriptive.map((t) => t.slot)).toEqual(["A1", "A2"]);
  });

  it("works the primary block out from the role, whatever the study has", () => {
    // Not every study has every table: this one's primary objective is a single
    // proportion, so there is no crude effect to slot. What must hold is that
    // whatever is there carries the slot the skeleton gives its role.
    const primary = built().filter((t) => t.block === "primary");
    expect(primary.length).toBeGreaterThan(1);
    for (const table of primary) {
      const expected = loadSlots().find((s) => s.block === "primary" && s.role === table.role);
      expect(table.slot, `${table.role} should be ${expected?.slot}`).toBe(expected?.slot);
    }
    expect(primary.map((t) => t.slot)).toContain("B1");
  });

  it("numbers a secondary block to its objective", () => {
    // S1 is the first secondary objective, so its tables are C1.1, C1.2 and so
    // on; S2's are C2.1. The number follows the objective, not the page.
    const secondary = built().filter((t) => t.block === "secondary");
    const forS1 = secondary.filter((t) => (t.fills ?? []).includes("S1")).map((t) => t.slot);
    const forS2 = secondary.filter((t) => (t.fills ?? []).includes("S2")).map((t) => t.slot);
    expect(forS1.every((s) => s?.startsWith("C1."))).toBe(true);
    expect(forS2.every((s) => s?.startsWith("C2."))).toBe(true);
    expect(forS1).toEqual([...new Set(forS1)]);
  });

  it("numbers the exploratory ones straight through", () => {
    const d = built().filter((t) => t.block === "exploratory").map((t) => t.slot);
    expect(d).toEqual(d.map((_, i) => `D${i + 1}`));
  });
});

describe("a skeleton with a piece missing", () => {
  const spec = (tables: ShellTable[]): ShellTablesSpec => ({
    ...tablesFixture,
    tables: tables.map((t, i) => ({ ...t, number: i + 1 })),
  });
  const codes = (tables: ShellTable[]) =>
    validateTables(spec(tables), sapFixture as SapSpec).findings.map((f) => f.code);

  it("TBL26 - a baseline table that names no slot", () => {
    const tables = structuredClone(tablesFixture.tables) as ShellTable[];
    delete tables.find((t) => t.block === "descriptive")!.slot;
    expect(codes(tables)).toContain("TBL26");
  });

  it("TBL27 - no demography table at all", () => {
    const tables = (structuredClone(tablesFixture.tables) as ShellTable[]).filter(
      (t) => t.slot !== "A1",
    );
    expect(codes(tables)).toContain("TBL27");
  });

  it("TBL27 - a surgical study with nothing from theatre", () => {
    // The fixture is a hernia repair, so A7 is owed and absent.
    const found = validateTables(tablesFixture, sapFixture as SapSpec).findings.find(
      (f) => f.code === "TBL27" && f.message.includes("theatre"),
    );
    expect(found?.severity).toBe("WARN");
  });
});
