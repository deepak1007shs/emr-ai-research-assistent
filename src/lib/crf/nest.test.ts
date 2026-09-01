import { describe, expect, it } from "vitest";
import { nestParts } from "./build.ts";
import { responseFor } from "./response.ts";
import type { CrfSection } from "./types.ts";

/**
 * Two things the house reference form needs and this application could not do.
 *
 * Its index test is one heading over three blocks, and eighteen of its answers
 * are given twice, once by each of two radiologists. Without both, the
 * reference form could not be produced here at all.
 */

const section = (letter: string, title: string): CrfSection => ({
  letter,
  title,
  fields: [{ label: title, type: "Text" }],
});

describe("a section with parts", () => {
  it("folds H1 and H2 into H, in order", () => {
    const out = nestParts([
      section("A", "Demographics"),
      section("H", "Index test"),
      section("H1", "Scan details"),
      section("H2", "Direct features"),
    ]);
    expect(out.map((s) => s.letter)).toEqual(["A", "H"]);
    expect(out[1].sections?.map((s) => s.title)).toEqual(["Scan details", "Direct features"]);
  });

  it("leaves an ordinary form untouched", () => {
    const flat = [section("A", "Demographics"), section("B", "Operation")];
    const out = nestParts(flat);
    expect(out.map((s) => s.letter)).toEqual(["A", "B"]);
    expect(out.every((s) => !s.sections)).toBe(true);
  });

  it("keeps a part whose section was never declared rather than losing it", () => {
    // A form missing a block is worse than a form with an odd letter on one.
    const out = nestParts([section("A", "Demographics"), section("Z3", "Orphaned block")]);
    expect(out.map((s) => s.title)).toContain("Orphaned block");
  });

  it("matches the letter whatever its case", () => {
    const out = nestParts([section("h", "Index test"), section("H1", "Scan details")]);
    expect(out).toHaveLength(1);
    expect(out[0].sections).toHaveLength(1);
  });
});

describe("a question answered by more than one person", () => {
  it("gives each their own labelled line", () => {
    expect(
      responseFor({
        label: "Adenomyosis",
        type: "Single-select",
        options: ["Present", "Absent", "Not assessable"],
        respondents: ["R1", "R2"],
      }),
    ).toBe("R1:  ☐ Present   ☐ Absent   ☐ Not assessable\nR2:  ☐ Present   ☐ Absent   ☐ Not assessable");
  });

  it("and prints exactly as before where only one person answers", () => {
    expect(responseFor({ label: "Age", type: "Number", unit: "years" })).toBe("________ years");
    expect(responseFor({ label: "Age", type: "Number", unit: "years", respondents: [] }))
      .toBe("________ years");
  });

  it("works for a measurement as well as a choice", () => {
    expect(responseFor({ label: "Uterine volume", type: "Number", unit: "mL", respondents: ["R1", "R2"] }))
      .toBe("R1:  ________ mL\nR2:  ________ mL");
  });
});
