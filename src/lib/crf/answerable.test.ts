import { describe, expect, it } from "vitest";
import { buildSap } from "../sap/build.ts";
import { buildCrf } from "./build.ts";
import { labelFor, responseFor } from "./response.ts";
import { idaPreg } from "../facts/fixture.ts";
import { vishal } from "../facts/fixture-vishal.ts";
import JSZip from "jszip";
import { buildCrfDocx } from "./docx.ts";

/**
 * Every field can be answered as its variable is typed.
 *
 * Found by the investigator on Dr Vishal's form, 14 Sep 2026: the reading typed
 * the date of admission and the date of surgery as dates, and the form printed
 * both as lines of text, because every administrative item was given a text
 * field. Two of its choices - the level of vascular injury, and postoperative
 * complications - had no categories, and the form printed a single-select with
 * nothing to tick. Every form check passed: they tested structure, not whether
 * a field could be filled in.
 */

const form = buildCrf(buildSap(vishal));
const field = (label: string, section?: string) =>
  form.fields.find((f) => f.label.startsWith(label) && (!section || f.section === section))!;

describe("an administrative item", () => {
  it("is collected as the type the reading gave it", () => {
    expect(field("Date of admission").type).toBe("date");
    expect(responseFor(field("Date of admission"))).toContain("DD/MM/YYYY");
    expect(field("Date of surgery").type).toBe("date");
  });

  it("stays a text field where the reading typed it text", () => {
    expect(field("CR number").type).toBe("text");
  });
});

describe("a choice the protocol gives no categories for", () => {
  const level = field("Anatomical level of vascular injury");

  it("is never an empty set of boxes", () => {
    expect(responseFor(level)).toMatch(/^_+$/);
    expect(responseFor(level)).not.toBe("");
  });

  it("says in its label what is missing", () => {
    expect(labelFor(level)).toContain("**TODO:**");
    expect(labelFor(level)).toContain("categories");
  });

  it("is named by CRF-3, and so reaches the form's open items", () => {
    const crf3 = form.checks.find((c) => c.id === "CRF-3")!;
    expect(crf3.pass).toBe(false);
    expect(crf3.failing.join(" ")).toContain("Anatomical level of vascular injury");
    // This fixture is the reading of 12 Sep, whose other option-less choices are
    // education, marital status and the level of amputation at each visit.
    expect(crf3.failing.join(" ")).toContain("Level of amputation");
    expect(form.todos.join(" ")).toContain("Anatomical level of vascular injury");
  });

  it("prints the TODO in bold on the Word form, not as asterisks", async () => {
    const zip = await JSZip.loadAsync(await buildCrfDocx(form));
    const xml = await zip.file("word/document.xml")!.async("string");
    expect(xml).not.toContain("**TODO:**");
    expect(xml).toMatch(/<w:b\/>[\s\S]{0,400}?TODO:/);
  });

  it("does not print a TODO on a choice that has its categories", () => {
    expect(labelFor(field("Mechanism of injury"))).not.toContain("TODO");
  });
});

describe("CRF-3", () => {
  it("passes a form whose every field can be answered", () => {
    const ida = buildCrf(buildSap(idaPreg));
    expect(ida.checks.find((c) => c.id === "CRF-3")?.pass).toBe(true);
  });

  it("fails a field whose type is not the one its variable owes", () => {
    const ida = buildSap(idaPreg);
    const built = buildCrf(ida);
    const age = built.fields.find((f) => f.source_variable === "age")!;
    const drifted = built.fields.map((f) => (f === age ? { ...f, type: "text" as const } : f));
    return import("./checks.ts").then(({ step8Checks }) => {
      const result = step8Checks({
        variables: ida.variables,
        sections: built.sections,
        fields: drifted,
      } as never).find((c) => c.id === "CRF-3");
      expect(result?.pass).toBe(false);
      expect(result?.failing.join(" ")).toContain("Age");
    });
  });
});
