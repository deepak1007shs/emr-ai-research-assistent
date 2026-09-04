import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { buildCrfDocx, labelNoteFor, responseFor } from "./crf-docx.ts";
import { HOUSE_FONT } from "./house-style.ts";
import { crfFixture } from "../crf/fixture.ts";

async function read(variant: "form" | "plan" = "form") {
  const zip = await JSZip.loadAsync(await buildCrfDocx(crfFixture, variant));
  const document = await zip.file("word/document.xml")!.async("string");
  const styles = await zip.file("word/styles.xml")!.async("string");
  const visible = document
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
  return { document, styles, visible };
}

describe("responseFor", () => {
  it("pre-prints every option with a box", () => {
    expect(responseFor({ label: "Sex", type: "Single-select", options: ["Male", "Female"] }))
      .toBe("☐ Male   ☐ Female");
  });

  it("shows the unit on a number", () => {
    expect(responseFor({ label: "Age", type: "Number", unit: "years" })).toContain("years");
  });

  it("gives a date its mask", () => {
    // The blanks alone do not say which number goes where, and a form filled in
    // one order and read in another is the commonest error on paper.
    expect(responseFor({ label: "DOB", type: "Date" })).toBe(
      "___ / ___ / ______  (DD/MM/YYYY)",
    );
  });

  it("prints the mask the plan supplies rather than the usual one", () => {
    expect(responseFor({ label: "Month of surgery", type: "Date", mask: "MM/YYYY" })).toBe(
      "___ / ___ / ______  (MM/YYYY)",
    );
  });

  it("masks the date half of a version-and-date field too", () => {
    expect(responseFor({ label: "CRF version", type: "Text / Date" })).toContain("(DD/MM/YYYY)");
  });

  it("says on a multi-select that more than one box may be ticked", () => {
    // Nothing else on the page distinguishes it from a single-select, and a
    // collector who ticks one box has answered a different question.
    expect(labelNoteFor({ label: "Comorbidities", type: "Multi-select" })).toBe(
      "(tick all that apply)",
    );
    expect(labelNoteFor({ label: "Sex", type: "Single-select" })).toBe("");
  });
});

/**
 * The rows of the field-type table in the skill's CRF_FORMAT_SPEC.md, which the
 * reference document was built from. Checked rather than remembered: the spec
 * lives outside this repository and cannot fail a build on its own.
 */
describe("the format spec's field-type table", () => {
  it.each([
    ["Text", { label: "Name", type: "Text" as const }, /^_{16,}$/],
    ["Number with a unit", { label: "Age", type: "Number" as const, unit: "years" }, /^_{8} years$/],
    ["Number with none", { label: "Count", type: "Number" as const }, /^_{8}$/],
    [
      "Single-select",
      { label: "Sex", type: "Single-select" as const, options: ["Male", "Female"] },
      /^☐ Male {3}☐ Female$/,
    ],
    [
      "Multi-select",
      { label: "Sites", type: "Multi-select" as const, options: ["Gastric", "Ileal"] },
      /^☐ Gastric {3}☐ Ileal$/,
    ],
    ["Date", { label: "DOB", type: "Date" as const }, /^_{3} \/ _{3} \/ _{6} {2}\(DD\/MM\/YYYY\)$/],
  ])("renders %s as the spec says", (_name, field, shape) => {
    expect(responseFor(field)).toMatch(shape);
  });
});

describe("the CRF document", () => {
  it("is the form and nothing else", async () => {
    // The person filling this in does not need the evidence that it is
    // complete. They need the questions, starting at the first one.
    const { visible } = await read();
    expect(visible).toContain("CASE RECORD FORM");
    expect(visible).not.toContain("DATA COLLECTION PLAN");
    expect(visible).not.toContain("roll-call");
    expect(visible).not.toContain("Collected once");
    expect(visible).not.toContain("Values calculated");
  });

  it("and the plan is the evidence, in its own document", async () => {
    const { visible } = await read("plan");
    expect(visible).toContain("DATA COLLECTION PLAN");
    expect(visible).toContain("roll-call");
    expect(visible).toContain("Collected once, collected repeatedly");
    expect(visible).not.toContain("CASE RECORD FORM");
  });

  it("says beside a calculated value what it is worked out from", async () => {
    // The value and its ingredients both, so the two can be checked against
    // each other. Said where the field is, not in a policy somewhere else.
    const { visible } = await read();
    expect(visible).toContain("Calculated from height and weight");
    expect(visible).toContain("Counted from the two dates above");
  });

  it("ticks the grid where an element is collected, and nowhere else", async () => {
    const { visible } = await read("plan");
    expect(visible).toContain("DATA ELEMENT");
    expect(visible).toContain("✓");
    for (const visit of crfFixture.visits) expect(visible).toContain(visit);
  });

  it("prints the roll-call with the field that captures each role", async () => {
    const { visible } = await read("plan");
    expect(visible).toContain("roll-call");
    expect(visible).toContain("primary outcome");
    expect(visible).toContain("Intraoperative conversion");
  });

  it("uses the house table and letters the sections", async () => {
    const { visible } = await read();
    expect(visible).toContain("Form & Subject Identifiers");
    expect(visible).toContain("Field / Variable");
    expect(visible).toContain("Field type");
    expect(visible).toContain("Section A - Demographics & Identification");
    expect(visible).toContain("Section B - Intraoperative Details");
  });

  it("sets the primary outcome apart", async () => {
    const { visible } = await read();
    expect(visible).toContain("Intraoperative conversion (primary outcome)");
  });

  it("tells the collector where more than one box may be ticked", async () => {
    // Cloned rather than added to the shared fixture: eight other test files
    // read it, and a field the plan does not declare is what CRF11 exists to
    // object to.
    const spec = structuredClone(crfFixture);
    const field = spec.sections[0].fields.find((f) => f.type === "Single-select")!;
    field.type = "Multi-select";

    const zip = await JSZip.loadAsync(await buildCrfDocx(spec, "form"));
    const visible = (await zip.file("word/document.xml")!.async("string")).replace(/<[^>]+>/g, "");
    expect(visible).toContain(`${field.label} (tick all that apply)`);
  });

  it("offers a calculated value as a field, and its ingredients too", async () => {
    // It used to offer neither, on the rule that a computed value entered by
    // hand cannot be audited. The ingredients are what make it auditable, and a
    // study whose entire comparison was a classification a clinician applies
    // had nowhere to write the classification down.
    const { visible } = await read();
    expect(visible).toContain("Body mass index");
    expect(visible).toContain("Height");
    expect(visible).toContain("Weight");
  });

  it("lists the calculated values with their formulas", async () => {
    const { visible } = await read("plan");
    const tail = visible.split("Values calculated from the form")[1] ?? "";
    expect(tail).toContain("Body mass index");
    expect(tail).toContain("Weight in kg divided by height in metres squared");
    expect(tail).toContain("worked out somewhere nobody can check");
  });

  it("splits a section into its parts, numbered from its letter", async () => {
    const { visible } = await read();
    expect(visible).toContain("B1 - Adhesion grading, scored independently");
    // The part sits under its section, not beside it.
    expect(visible.indexOf("Section B -")).toBeLessThan(visible.indexOf("B1 -"));
  });

  it("gives each observer a line of their own", async () => {
    // A single line cannot hold a disagreement, and the disagreement is what an
    // agreement study measures.
    const { visible } = await read();
    expect(visible).toContain("R1:");
    expect(visible).toContain("R2:");
    expect(visible).toContain("Each surgeon grades without seeing");
  });

  it("has no investigator sign-off", async () => {
    const { visible } = await read();
    expect(visible).not.toContain("Sign-off");
    expect(visible).not.toContain("Data verified by");
  });

  it("obeys the house style", async () => {
    const { document, styles, visible } = await read();
    expect(styles).toContain(HOUSE_FONT);
    expect(styles).toContain('w:sz w:val="24"');
    for (const xml of [document, styles]) {
      const colours = [...xml.matchAll(/w:color w:val="([0-9A-Fa-f]{6})"/g)].map((m) => m[1]);
      expect(colours.filter((c) => c.toUpperCase() !== "000000")).toEqual([]);
    }
    for (const glyph of ["—", "–", "“", "”", "’"]) expect(visible).not.toContain(glyph);
    expect(document).not.toContain("<w:pBdr>");
  });

  it("keeps the ballot box, which the house forms use", async () => {
    const { visible } = await read();
    expect(visible).toContain("☐");
  });

  it("keeps the spacing an answer space is drawn with", async () => {
    // The gaps are the layout, not prose. responseFor has always returned three
    // spaces between the boxes and the reference form has always printed three,
    // and until this test nothing compared the two: the house-style cleaner
    // collapses runs of spaces, so every form ever downloaded printed one.
    const { visible } = await read();
    expect(visible).toContain("☐ Male   ☐ Female");
    expect(visible).toContain("___ / ___ / ______  (DD/MM/YYYY)");
  });
});
