import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { buildCrfDocx, responseFor } from "./crf-docx.ts";
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
    expect(responseFor({ label: "DOB", type: "Date" })).toBe("___ / ___ / ______");
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

  it("still tells the collector not to enter what is calculated", async () => {
    // Said where the temptation is, under the section that collects its parts.
    const { visible } = await read();
    expect(visible).toContain("Do not enter it here");
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

  it("never offers a calculated value as a field", async () => {
    const { visible } = await read();
    const form = visible.split("Values calculated from this form")[0];

    // The name may appear in a note explaining why it is absent; what must not
    // appear is a row, which renders as the label followed by its field type.
    expect(form).not.toMatch(/Body mass index(Number|Text|Date|Single-select)/);
    expect(form).not.toMatch(/Postoperative length of stay(Number|Text|Date)/);

    // And the note that says so should be there.
    expect(form).toContain("Body mass index is calculated");
    expect(form).toContain("Do not enter it here");
  });

  it("lists the calculated values with their formulas", async () => {
    const { visible } = await read("plan");
    const tail = visible.split("Values calculated from the form")[1] ?? "";
    expect(tail).toContain("Body mass index");
    expect(tail).toContain("Weight in kg divided by height in metres squared");
    expect(tail).toContain("worked out somewhere nobody can check");
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
});
