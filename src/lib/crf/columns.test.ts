import { describe, expect, it } from "vitest";
import { assignColumnNames, columnsByVariable, slug } from "./columns.ts";
import { crfFixture } from "./fixture.ts";
import type { CrfSpec } from "./types.ts";

/**
 * The one property that matters is uniqueness.
 *
 * A clumsy column name costs a reader a second. Two fields sharing one costs
 * the study a variable, silently, because the second overwrites the first in
 * whatever spreadsheet the data are typed into.
 */

describe("a datasheet column name", () => {
  it("is a spreadsheet header, not a sentence", () => {
    expect(slug("Age (years)")).toBe("age");
    expect(slug("Serum albumin (g/dL)")).toBe("serum_albumin");
    expect(slug("ASA physical status grade")).toBe("asa_physical_status_grade");
    expect(slug("Previous abdominal surgery?")).toBe("previous_abdominal_surgery");
  });

  it("is never empty, whatever it was made from", () => {
    for (const label of ["", "   ", "()", "???", "(kg/m2)"]) {
      expect(slug(label)).toMatch(/^[a-z][a-z0-9_]*$/);
    }
  });

  it("keeps the name the model chose", () => {
    const spec = assignColumnNames({
      ...crfFixture,
      identifiers: [{ label: "Diabetes mellitus", type: "Single-select", column_name: "dm" }],
    } as CrfSpec);
    expect(spec.identifiers[0].column_name).toBe("dm");
  });

  it("gives every field one, including the ones in sub-sections", () => {
    const spec = assignColumnNames(crfFixture);
    const named = [
      ...spec.identifiers,
      ...spec.sections.flatMap((s) => [...s.fields, ...(s.sections ?? []).flatMap((p) => p.fields)]),
    ];
    expect(named.length).toBeGreaterThan(0);
    for (const field of named) {
      expect(field.column_name, field.label).toMatch(/^[a-z][a-z0-9_]*$/);
    }
  });

  it("never lets two fields share one", () => {
    const spec = assignColumnNames({
      ...crfFixture,
      identifiers: [
        { label: "Diabetes mellitus", type: "Single-select", column_name: "dm" },
        { label: "Diabetes mellitus", type: "Single-select", column_name: "dm" },
        { label: "Diabetes", type: "Single-select" },
      ],
    } as CrfSpec);
    const names = spec.identifiers.map((f) => f.column_name);
    expect(names).toEqual(["dm", "dm_2", "diabetes"]);
    expect(new Set(names).size).toBe(names.length);
  });

  it("holds across the whole form, not just within a section", () => {
    const spec = assignColumnNames(crfFixture);
    const all = [
      ...spec.identifiers,
      ...spec.sections.flatMap((s) => [...s.fields, ...(s.sections ?? []).flatMap((p) => p.fields)]),
    ].map((f) => f.column_name);
    expect(new Set(all).size).toBe(all.length);
  });

  it("carries the plan's variables through to whatever is built from the form", () => {
    const spec = assignColumnNames(crfFixture);
    const columns = columnsByVariable(spec);
    // Every field the plan declares a variable for reaches the blueprint.
    const declared = [
      ...spec.identifiers,
      ...spec.sections.flatMap((s) => [...s.fields, ...(s.sections ?? []).flatMap((p) => p.fields)]),
    ].filter((f) => f.variable_id);
    expect(declared.length).toBeGreaterThan(0);
    for (const field of declared) {
      expect(columns[field.variable_id!], field.variable_id).toBeTruthy();
    }
  });
});
