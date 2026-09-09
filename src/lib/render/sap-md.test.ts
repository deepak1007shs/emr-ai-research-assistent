import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { buildSapMarkdown } from "./sap-md.ts";
import { buildSapDocx } from "./sap-docx.ts";
import { sapFixture } from "../sap/fixture.ts";
import { chooseTest } from "../sap/choose-test.ts";
import { tableNumbers } from "../tables/types.ts";
import { tablesFixture } from "../tables/fixture.ts";

/**
 * A second renderer that drifts is worse than no second renderer: someone would
 * read one and hand over the other. These hold the Markdown and the Word
 * document to the same plan.
 */

const md = buildSapMarkdown(sapFixture);

async function docxText(): Promise<string> {
  const zip = await JSZip.loadAsync(await buildSapDocx(sapFixture));
  return (await zip.file("word/document.xml")!.async("string"))
    .replace(/<[^>]+>/g, " ")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");
}

describe("the SAP as Markdown", () => {
  it("carries every section, in the document's order", () => {
    const order = [
      "# STATISTICAL ANALYSIS PLAN",
      "## PICOT/PECO",
      "## Section 1 - Objectives as Answerable Questions",
      "## Analysis Map",
      "## Section 6 - Shell (Dummy) Tables",
    ];
    let at = -1;
    for (const heading of order) {
      const found = md.indexOf(heading);
      expect(found, `${heading} is missing`).toBeGreaterThan(-1);
      expect(found, `${heading} is out of order`).toBeGreaterThan(at);
      at = found;
    }
  });

  it("names the same tests as the document, from the same rule table", async () => {
    const page = await docxText();
    for (const row of sapFixture.analyses) {
      const plan = chooseTest(row)!;
      // The map states the test that was chosen. What must not be done with it
      // is said in the footnote of the table it fills, which is where the
      // blueprint puts it, so it is checked with the tables rather than here.
      for (const part of [plan.unadjusted, plan.adjusted, plan.avoid]) {
        if (!part) continue;
        // The two renderings agree, whether or not either prints this part: a
        // row that plans no adjusted model says so in both, and what must not
        // be done reaches the reader through the footnote of the table it
        // fills, in both.
        expect(md.includes(part), `${part}`).toBe(page.includes(part));
      }
    }
  });

  it("carries every variable that reaches a table", () => {
    // The variable table is not a section of the house format. A variable still
    // reaches the reader through the tables that report it, which is the same
    // check the tables' own TBL33 makes from the other direction.
    const reported = new Set(
      tablesFixture.tables.flatMap((t) => (t.rows ?? []).map((r) => r.variable_id)),
    );
    const withTables = buildSapMarkdown(sapFixture, tableNumbers(tablesFixture), {
      shells: tablesFixture,
    });
    for (const variable of sapFixture.variables) {
      if (!reported.has(variable.id)) continue;
      expect(withTables, variable.label).toContain(variable.label);
    }
  });

  it("writes tables a Markdown reader can parse", () => {
    // Every row of a table has the same number of columns as its header.
    for (const block of md.split("\n\n")) {
      const rows = block.split("\n").filter((l) => l.startsWith("|"));
      if (rows.length < 2) continue;
      const width = rows[0].split("|").length;
      for (const row of rows) {
        expect(row.split("|").length, `ragged table row: ${row}`).toBe(width);
      }
    }
  });

  it("takes the table number from the shell tables when they exist", () => {
    const withNumbers = buildSapMarkdown(sapFixture, tableNumbers(tablesFixture));
    expect(withNumbers).toContain("-> Table 3");
    // The plan's own provisional number is not what a reader is sent to.
    expect(md).toContain("-> T2");
  });

  it("renders a plan stored before the route map existed", () => {
    const old = structuredClone(sapFixture) as Record<string, unknown>;
    for (const gone of ["glance", "picot", "estimand", "rules", "steps", "flags"]) {
      delete old[gone];
    }
    expect(() => buildSapMarkdown(old as never)).not.toThrow();
    expect(buildSapMarkdown(old as never)).toContain("## Analysis Map");
  });
});
