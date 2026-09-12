import { describe, expect, it } from "vitest";
import { idaPreg } from "../facts/fixture.ts";
import { elastography } from "../facts/fixture-diagnostic.ts";
import type { FactsSheet } from "../study/types.ts";
import { buildSap } from "../sap/build.ts";
import { buildCrf, crfBlockers, crfWarnings } from "./build.ts";
import { renderCrfMarkdown } from "./markdown.ts";
import { responseFor } from "./response.ts";

/**
 * The form, end to end.
 *
 * The same acceptance test the plan holds to: build it twice from one reading
 * and the two files are identical. The Word file cannot be compared that way -
 * a zip carries the time it was written - so the markdown is what is pinned.
 *
 * What the assertions are for: a form is filled in by somebody who has never
 * read the plan, and every one of these is a place they would otherwise have to
 * guess - a number with no unit, a question with no boxes, a section that
 * starts at 4, an answer already written in.
 */

const formOf = (facts: FactsSheet) => buildCrf(buildSap(facts));
const form = formOf(idaPreg);
const fieldsIn = (code: string) => form.fields.filter((f) => f.section === code);
const labels = form.fields.map((f) => f.label);

describe("the form, built from the plan", () => {
  it("builds the same file twice", () => {
    expect(renderCrfMarkdown(formOf(idaPreg))).toBe(renderCrfMarkdown(form));
  });

  it("numbers every section from 1", () => {
    expect(form.sections.length).toBeGreaterThan(3);
    for (const section of form.sections) {
      const numbers = fieldsIn(section.code).map((f) => f.sno);
      expect(numbers, section.code).toEqual(numbers.map((_, i) => i + 1));
      expect(section.title.trim(), section.code).not.toBe("");
    }
  });

  it("leaves every answer blank", () => {
    for (const field of form.fields) {
      const response = responseFor(field);
      // What a response may contain: the blanks, the boxes, the options it
      // offers, a unit, and the date mask. Never a value.
      // The mask and the unit contain slashes, so they are removed before the
      // punctuation is: strip the slashes first and "g/dL" is "gdL", which
      // matches nothing and reads as a value somebody wrote in.
      // Longest option first, or "II" is removed from inside "III".
      const options = [...(field.options ?? [])].sort((a, b) => b.length - a.length);
      const left = response
        .replace(/\(DD\/MM\/YYYY\)/g, "")
        .replace(field.unit ? new RegExp(field.unit.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g") : /(?!)/g, "")
        .replace(new RegExp(options.map((o) => o.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|") || "(?!)", "g"), "")
        .replace(/[_☐/]/g, "")
        .replace(/Other:/g, "")
        .replace(/\s+/g, "");
      expect(left, `${field.section}${field.sno} ${field.label}`).toBe("");
    }
  });

  it("keeps the spaces that are the layout", () => {
    const text = renderCrfMarkdown(form);
    // Three between two boxes, two before the date's own note. Collapsed to
    // one, two choices read as a single line of text.
    expect(text).toContain("☐ Yes   ☐ No");
    expect(text).toContain("___ / ___ / ______  (DD/MM/YYYY)");
    expect(text).toContain("________ g/dL");
  });

  it("asks for the parts, never the value computed from them", () => {
    const derived = buildSap(idaPreg).variables.filter((v) => !v.crf).map((v) => v.name);
    expect(derived).toContain("bmi");
    for (const name of derived) {
      expect(form.fields.map((f) => f.source_variable), name).not.toContain(name);
    }
    // Height and weight are on the form because a table reports body mass index.
    expect(labels).toContain("Height");
    expect(labels).toContain("Weight");
  });

  it("writes a repeated measure into every visit that takes it", () => {
    const haemoglobin = form.fields.filter((f) => f.source_variable === "haemoglobin");
    expect(haemoglobin.map((f) => f.timepoint)).toEqual(["D0", "W2", "W4", "W6"]);
  });

  it("passes its own checks on the worked example", () => {
    expect(crfBlockers(form).map((c) => c.id)).toEqual([]);
    expect(crfWarnings(form).map((c) => c.id)).toEqual([]);
  });

  it("prints the title and the four columns", () => {
    const text = renderCrfMarkdown(form);
    expect(text).toContain("# CASE RECORD FORM");
    expect(text).toContain(idaPreg.title);
    expect(text).toContain("| S.No. | Field / Variable | Field type | Response |");
  });
});

describe("a diagnostic study's form", () => {
  const diagnostic = formOf(elastography);

  it("collects each index test and the grade the reference is read from", () => {
    const sources = diagnostic.fields.map((f) => f.source_variable);
    for (const name of ["stiffness_mean", "ratio_mean", "ratio_max", "bethesda"]) {
      expect(sources, name).toContain(name);
    }
    // The target condition is cut from the grade, so the grade is captured.
    expect(sources).not.toContain("malignant");
  });

  it("passes Gate C", () => {
    expect(crfBlockers(diagnostic).map((c) => c.id)).toEqual([]);
  });
});
