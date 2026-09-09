import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { buildSapDocx } from "./sap-docx.ts";
import { HOUSE_FONT } from "./house-style.ts";
import type { SapSpec } from "../sap/types.ts";
import { sapFixture as spec } from "../sap/fixture.ts";
import { tableNumbers } from "../tables/types.ts";
import { tablesFixture } from "../tables/fixture.ts";
import { BLOCK_HEADING, BLOCK_ORDER } from "../tables/block-notes.ts";


/**
 * The plan as a reader receives it: with its Section 6.
 *
 * The tables carry the footnotes now - the test, the assumption it falls back
 * on, the degrees of freedom the model can afford - so a plan rendered without
 * them is a plan with none of that in it.
 */
/** The plan before its tables exist, where the map carries its own numbering. */
async function readPlanOnly(s: SapSpec = spec) {
  const zip = await JSZip.loadAsync(await buildSapDocx(s));
  const xml = await zip.file("word/document.xml")!.async("string");
  return {
    visible: xml
      .replace(/<[^>]+>/g, "")
      .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&"),
  };
}

async function read(s: SapSpec = spec) {
  const zip = await JSZip.loadAsync(
    await buildSapDocx(s, tableNumbers(tablesFixture), { shells: tablesFixture }),
  );
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
    // The house blueprint's four parts and nothing between them. The variable
    // table, the rules, the analysis flow and the assumption checks are still
    // computed - they choose the tests and write the footnotes - but the
    // blueprint prints none of them as a section of its own.
    const order = [
      "STATISTICAL ANALYSIS PLAN",
      "PICOT/PECO",
      "Section 1 - Objectives as Answerable Questions",
      "Analysis Map",
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
    // One heading and one set of element labels whichever framework the study
    // uses, as the blueprint's own observational example prints them.
    expect(visible).toContain("PICOT/PECO");
    expect(visible).toContain("Intervention / Exposure");
    expect(visible).toContain("For this study");
    expect(visible).toContain("Assembled question");
  });

  it("carries the assumption into the footnote, where the blueprint puts it", async () => {
    const { visible } = await read();
    // The assumption checks have no section of their own any more. What they
    // decide still reaches the reader: the footnote names the test and the
    // test it falls back to when the assumption fails.
    expect(visible).toContain("Fisher exact where any expected cell is under 5");
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
    // "P1." as the house documents number them, not "P1:".
    expect(visible).toContain("P1.");
    expect(visible).toContain("S1.");
  });

  it("carries the five analysis-map columns", async () => {
    const { visible } = await read();
    for (const header of ["Objective", "Outcome", "Predictor(s)", "Data type", "Statistical test"]) {
      expect(visible).toContain(header);
    }
  });

  it("names the test the rules choose, never one the model invented", async () => {
    // The map alone: a descriptive table legitimately footnotes a t-test for
    // its continuous rows, and that is not the skewed outcome this is about.
    const { visible } = await readPlanOnly();
    expect(visible).toContain("Clopper-Pearson");        // binary, single group
    expect(visible).toContain("Multivariable binary logistic regression"); // binary, adjusted
    expect(visible).toContain("Mann-Whitney");            // continuous, skewed
    expect(visible).not.toContain("Independent t-test");  // would be wrong for skewed data
  });

  it("points each row at every table it fills", async () => {
    const { visible } = await readPlanOnly();
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
  });

  it("keeps the exposure apart from what is held constant", async () => {
    const { visible } = await read();
    expect(visible).toContain("Previous abdominal surgery; adjust for Age, Body mass index");
    expect(visible).toContain("None (single-group estimation)");
  });

  it("declares the adjusted model exploratory when the events cannot afford it", async () => {
    const { visible } = await read();
    // 10 events affords one predictor; three are named. Said in the footnote of
    // the table that would report the model, rather than in a section about
    // degrees of freedom that the blueprint does not carry.
    expect(visible).toContain("Expected events: 10");
    expect(visible).toContain("declared exploratory");
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
      expect(visible, `Table ${table.number}`).toContain(
        `Table ${table.number}.  ${table.title}`,
      );
    }
    expect(xml).toContain("<w:tbl>");
  });

  it("groups them into the four families, in the blueprint's order", async () => {
    // There used to be a contents list above these. The blueprint has none:
    // inside the plan it duplicates the plan's own numbering, and it was
    // navigation left over from when the tables were a separate document.
    const { visible } = await withTables();
    expect(visible).not.toContain("Contents:");

    let at = -1;
    for (const heading of BLOCK_ORDER.map((b) => BLOCK_HEADING[b])) {
      const found = visible.indexOf(heading);
      expect(found, `${heading} is missing`).toBeGreaterThan(-1);
      expect(found, `${heading} is out of order`).toBeGreaterThan(at);
      at = found;
    }
  });

  it("says which test fills each grid", async () => {
    const { visible } = await withTables();
    expect(visible).toContain("Footnote: test used = ");
  });

  it("does not repeat what the plan already fixed elsewhere", async () => {
    // The analysis map links objectives to tables. Saying it again here is a
    // second statement that can disagree with the first.
    const { visible } = await withTables();
    const section6 = visible.slice(visible.indexOf("Section 6 - Shell"));
    expect(section6).not.toContain("Objective to table coverage check");
    expect(section6).not.toContain("Missing data, fixed in advance");
  });

  it("still renders when the tables have not been built", async () => {
    // The plan comes before the tables and must not need them to print.
    const { visible } = await readPlanOnly();
    expect(visible).toContain("Section 6 - Shell (Dummy) Tables");
    expect(visible).toContain("have not been built yet");
  });
});
