import { describe, expect, it } from "vitest";
import { blockNote, populationLine } from "./block-notes.ts";
import { tablesFixture } from "./fixture.ts";
import { sapFixture } from "../sap/fixture.ts";

/**
 * The line under each family heading.
 *
 * The blueprint is firmer about placement here than anywhere else: multiplicity
 * is a note under the family it governs and never a section, and the primary
 * block opens by saying who is analysed.
 */
describe("the note under a family heading", () => {
  it("says who is analysed, above the primary block only", () => {
    expect(blockNote("primary", tablesFixture)).toContain("Full analysis set");
    for (const block of ["descriptive", "secondary", "exploratory"] as const) {
      expect(blockNote(block, tablesFixture)).not.toContain("Full analysis set");
    }
  });

  it("carries the multiplicity rule to every family that makes a claim", () => {
    const rule = tablesFixture.multiplicity!;
    for (const block of ["primary", "secondary", "exploratory"] as const) {
      expect(blockNote(block, tablesFixture), block).toContain(rule);
    }
    // The descriptive block claims nothing, so a multiplicity rule under it
    // would be a rule about nothing.
    expect(blockNote("descriptive", tablesFixture)).not.toContain(rule);
  });

  it("composes the population line for tables stored before it existed", () => {
    // Every plan already in the database was built without this field. Falling
    // back to the plan means they gain the line on their next download rather
    // than only when they are rebuilt, which none of them may ever be.
    const stored = { ...tablesFixture, analysis_population: undefined };

    expect(blockNote("primary", stored)).not.toContain("Full analysis set");
    expect(blockNote("primary", stored, sapFixture)).toContain("Full analysis set");
    expect(blockNote("primary", stored, sapFixture)).toContain("Missing data:");
  });

  it("says nothing where the plan defines no population", () => {
    expect(populationLine({ ...sapFixture, populations: [] })).toBeUndefined();
  });
});
