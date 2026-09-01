import { describe, expect, it } from "vitest";
import { validateCrf } from "./validate.ts";
import { missingFields } from "./build.ts";
import { requiredFields } from "./required.ts";
import { crfFixture } from "./fixture.ts";
import { sapFixture } from "../sap/fixture.ts";
import { buildCrfDocx } from "../render/crf-docx.ts";
import type { CrfSpec } from "./types.ts";
import type { SapSpec } from "../sap/types.ts";

/**
 * Everything that asks "is this variable collected?" must answer the same way.
 *
 * Three times now a rule has been changed where it was noticed and left
 * standing where it quietly agreed. A calculated value stopped counting as
 * collected in the guard and went on counting in the pass that fills the gaps,
 * so the guard reported a hole the pass would not fill. A section gained parts
 * and four places went on reading only the top level, so a field inside one was
 * invisible to all of them.
 *
 * These tests are the thing that notices. They compare the answers rather than
 * any one of them, so a rule changed in one place and not another fails here
 * whatever the rule happens to be.
 */

const form = () => structuredClone(crfFixture) as CrfSpec;
const plan = () => structuredClone(sapFixture) as SapSpec;

describe("the checks agree with each other", () => {
  it("what the guard says is missing is what the second pass asks for", () => {
    const c = form();
    // Drop the exposure everywhere it can hide: a section, a section's parts,
    // and the calculated values.
    const drop = (f: { variable_id?: string }) => f.variable_id !== "var_adhesion";
    for (const section of c.sections) {
      section.fields = section.fields.filter(drop);
      for (const part of section.sections ?? []) part.fields = part.fields.filter(drop);
    }

    const flagged = validateCrf(c, plan())
      .findings.filter((f) => f.code === "CRF09")
      .map((f) => f.message);
    const asked = missingFields(c, plan()).map((f) => f.label);

    expect(asked).toContain("Adhesion severity");
    expect(flagged.join(" ")).toContain("Adhesion severity");
    // Not merely both non-empty: the same set, or the pass leaves behind
    // exactly what the guard will then complain about.
    expect(asked.length).toBe(flagged.length);
  });

  it("a field in a section's parts counts everywhere, or nowhere", () => {
    const c = form();
    const inParts = c.sections
      .flatMap((s) => s.sections ?? [])
      .flatMap((p) => p.fields)
      .map((f) => f.variable_id)
      .filter(Boolean);
    expect(inParts.length, "the fixture no longer exercises a section's parts").toBeGreaterThan(0);

    // Neither the guard nor the pass may think it is missing.
    const flagged = validateCrf(c, plan()).findings.filter((f) => f.code === "CRF09");
    const asked = missingFields(c, plan()).map((f) => f.variable_id);
    for (const id of inParts) {
      expect(asked, `${id} asked for again`).not.toContain(id);
      expect(flagged.map((f) => f.message).join(" ")).not.toContain(id!);
    }
  });

  it("a calculated value is required, and not excused by being calculated", () => {
    // The loophole: an entry in the calculated values used to satisfy both the
    // guard and the pass, so a variable could be named there, have no field,
    // and be reported by nothing.
    const derived = plan().variables.filter((v) => v.derived_from?.length);
    expect(derived.length, "the fixture no longer has a calculated value").toBeGreaterThan(0);

    const required = requiredFields(plan()).map((f) => f.variable_id);
    for (const v of derived) expect(required, `${v.id} not required`).toContain(v.id);

    const c = form();
    for (const section of c.sections) {
      section.fields = section.fields.filter((f) => f.variable_id !== derived[0].id);
    }
    expect(missingFields(c, plan()).map((f) => f.variable_id)).toContain(derived[0].id);
    expect(
      validateCrf(c, plan()).findings.filter((f) => f.code === "CRF09").map((f) => f.message).join(" "),
    ).toContain(derived[0].label);
  });

  it("every required field is printed on the form the collector is handed", async () => {
    // The last link. A variable can be required, collected and validated, and
    // still never reach the page.
    const buffer = await buildCrfDocx(form());
    const JSZip = (await import("jszip")).default;
    const zip = await JSZip.loadAsync(buffer);
    const visible = (await zip.file("word/document.xml")!.async("string"))
      .replace(/<[^>]+>/g, "")
      .replace(/&amp;/g, "&");

    for (const field of requiredFields(plan())) {
      expect(visible, `${field.variable_id} is required and not on the form`).toContain(field.label);
    }
  });
});
