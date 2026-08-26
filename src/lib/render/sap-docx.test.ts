import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { buildSapDocx } from "./sap-docx.ts";
import { HOUSE_FONT } from "./house-style.ts";
import type { SapSpec } from "../sap/types.ts";
import { sapFixture as spec } from "../sap/fixture.ts";


async function read(s: SapSpec = spec) {
  const zip = await JSZip.loadAsync(await buildSapDocx(s));
  const document = await zip.file("word/document.xml")!.async("string");
  const styles = await zip.file("word/styles.xml")!.async("string");
  const visible = document
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
  return { document, styles, visible };
}

describe("the SAP document", () => {
  it("carries every section of the route map, in order", async () => {
    const { visible } = await read();
    const order = [
      "STATISTICAL ANALYSIS PLAN",
      "Section 0 - Study at a Glance",
      "Section 1 - Objectives as Answerable Questions",
      "Primary estimand",
      "Section 2 - Variable Table",
      "Section 3 - Analysis Map",
      "Section 4 - General Statistical Rules",
      "Analysis populations",
      "Section 5 - Step-by-Step Analysis Flow",
      "Section 5A - Assumption Checking",
      "Section 6 - Shell (Dummy) Tables",
      "Section 7 - Needs Checking",
      "Document control and sign-off",
    ];
    let at = -1;
    for (const section of order) {
      const found = visible.indexOf(section);
      expect(found, `${section} is missing`).toBeGreaterThan(-1);
      expect(found, `${section} is out of order`).toBeGreaterThan(at);
      at = found;
    }
  });

  it("decomposes the question, and names the frame the design calls for", async () => {
    const { visible } = await read();
    // Observational, so PECOT rather than PICOT, and an exposure not an
    // intervention.
    expect(visible).toContain("PECOT");
    expect(visible).toContain("E - Exposure");
    expect(visible).toContain("Assembled question");
  });

  it("states the assumptions of the tests it actually chose", async () => {
    const { visible } = await read();
    for (const check of spec.assumption_checks) {
      expect(visible, check.test).toContain(check.test);
      expect(visible).toContain(check.assumption);
      expect(visible).toContain(check.if_violated);
    }
  });

  it("keeps the sample-size basis, not just the number", async () => {
    const { visible } = await read();
    expect(visible).toContain("Sample-size note");
    expect(visible).toContain("TODO");
  });

  it("numbers the objectives P and S, as questions", async () => {
    const { visible } = await read();
    expect(visible).toContain("Aim");
    expect(visible).toContain("Primary objective(s)");
    expect(visible).toContain("Secondary objectives");
    expect(visible).toContain("P1:");
    expect(visible).toContain("S1:");
  });

  it("carries the five analysis-map columns", async () => {
    const { visible } = await read();
    for (const header of ["Objective", "Outcome", "Predictor(s)", "Data type", "Statistical test"]) {
      expect(visible).toContain(header);
    }
  });

  it("names the test the rules choose, never one the model invented", async () => {
    const { visible } = await read();
    expect(visible).toContain("Clopper-Pearson");        // binary, single group
    expect(visible).toContain("Multivariable binary logistic regression"); // binary, adjusted
    expect(visible).toContain("Mann-Whitney");            // continuous, skewed
    expect(visible).not.toContain("Independent t-test");  // would be wrong for skewed data
  });

  it("points each row at its table", async () => {
    const { visible } = await read();
    expect(visible).toContain("-> T1");
    expect(visible).toContain("-> T3");
  });

  it("declares the adjusted model exploratory when the events cannot afford it", async () => {
    const { visible } = await read();
    // 10 events affords one predictor; three are named.
    expect(visible).toContain("Degrees of freedom");
    expect(visible).toContain("declared exploratory");
  });

  it("names the mediator and the collider, and says neither enters a model", async () => {
    const { visible } = await read();
    expect(visible).toContain("Not adjusted for");
    expect(visible).toContain("is a mediator");
    expect(visible).toContain("is a collider");
    expect(visible).toContain("Neither enters any model");
  });

  it("says so loudly when no rule covers a row", async () => {
    const gap: SapSpec = {
      ...spec,
      analyses: [{ ...spec.analyses[0], data_type: "count" as const, comparison: "agreement" as const }],
    };
    const { visible } = await read(gap);
    expect(visible).toContain("NO RULE COVERS THIS ROW");
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
});
