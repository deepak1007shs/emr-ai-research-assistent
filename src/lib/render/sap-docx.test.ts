import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { buildSapDocx } from "./sap-docx.ts";
import { HOUSE_FONT } from "./house-style.ts";
import type { SapSpec } from "../sap/types.ts";
import { sapFixture as spec } from "../sap/fixture.ts";
import { tableNumbers } from "../tables/types.ts";


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
      "Section 1 - Objectives as Answerable Questions",
      "Primary estimand",
      "Section 2 - Variable Table",
      "Section 3 - Analysis Map",
      "Section 4 - General Statistical Rules",
      "Analysis populations",
      "Section 5 - Step-by-Step Analysis Flow",
      "Section 5A - Assumption Checking",
      "Section 6 - Shell (Dummy) Tables",
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

  it("keeps the sample-size basis with the rules, not just the number", async () => {
    const { visible } = await read();
    expect(visible).toContain("Sample size.");
    expect(visible).toContain("TODO");
  });

  it("carries none of the three sections that were dropped", async () => {
    const { visible } = await read();
    for (const gone of ["Study at a Glance", "Needs Checking", "Document control"]) {
      expect(visible, `${gone} should be gone`).not.toContain(gone);
    }
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
    for (const header of ["Objective", "Outcome", "Predictor(s)", "Data type", "Statistical analysis"]) {
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

  it("points each row at every table it fills", async () => {
    const { visible } = await read();
    // One analysis often fills more than one: the unadjusted estimate and the
    // adjusted model beside it.
    expect(visible).toContain("-> T1");
    expect(visible).toContain("-> T2, T3");
  });

  it("plans the analysis rather than naming a test", async () => {
    const { visible } = await read();
    expect(visible).toContain("Unadjusted:");
    expect(visible).toContain("Adjusted:");
    // A row that plans no adjusted model says why, rather than leaving a blank.
    expect(visible).toContain("Adjusted: not planned -");
    expect(visible).toContain("What must not be done");
  });

  it("keeps the exposure apart from what is held constant", async () => {
    const { visible } = await read();
    expect(visible).toContain("Previous abdominal surgery; adjust for Age, Body mass index");
    expect(visible).toContain("None (single-group estimation)");
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

/**
 * The tables are in the plan now, under the heading that used to point at
 * another document.
 *
 * Section 6 held one sentence saying the tables were "in the Shell Tables
 * document that accompanies this plan": two documents, one of which existed to
 * say where the other was. A supervisor signs one.
 */
describe("Section 6", () => {
  async function withTables() {
    const { tablesFixture } = await import("../tables/fixture.ts");
    const zip = await JSZip.loadAsync(
      await buildSapDocx(spec, tableNumbers(tablesFixture), { shells: tablesFixture }),
    );
    const xml = await zip.file("word/document.xml")!.async("string");
    return {
      xml,
      visible: xml.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&"),
      tables: tablesFixture,
    };
  }

  it("draws every table the plan has, rather than naming another document", async () => {
    const { visible, xml, tables } = await withTables();
    expect(visible).toContain("Section 6 - Shell (Dummy) Tables");
    expect(visible).not.toContain("document that accompanies this plan");
    for (const table of tables.tables) {
      expect(visible, `Table ${table.number}`).toContain(`Table ${table.number}: ${table.title}`);
    }
    expect(xml).toContain("<w:tbl>");
  });

  it("lists them first, and lists exactly the ones it draws", async () => {
    const { visible, tables } = await withTables();
    const contentsAt = visible.indexOf(`Contents: ${tables.tables.length} tables`);
    expect(contentsAt).toBeGreaterThan(-1);
    // Every table is named in the list before it is drawn below it.
    for (const table of tables.tables) {
      expect(visible.indexOf(`Table ${table.number}.`)).toBeLessThan(
        visible.indexOf(`Table ${table.number}: ${table.title}`),
      );
    }
  });

  it("says which test fills each grid", async () => {
    const { visible } = await withTables();
    expect(visible).toContain("Footnote: test used = ");
  });

  it("does not repeat what the plan already fixed elsewhere", async () => {
    // Section 4 states the missing-data rule and Section 3 links objectives to
    // tables. Saying either again here is a second statement that can disagree.
    const { visible } = await withTables();
    const section6 = visible.slice(visible.indexOf("Section 6 - Shell"));
    expect(section6).not.toContain("Objective to table coverage check");
    expect(section6).not.toContain("Missing data, fixed in advance");
  });

  it("still renders when the tables have not been built", async () => {
    // The plan comes before the tables and must not need them to print.
    const { visible } = await read();
    expect(visible).toContain("Section 6 - Shell (Dummy) Tables");
    expect(visible).toContain("have not been built yet");
  });
});
