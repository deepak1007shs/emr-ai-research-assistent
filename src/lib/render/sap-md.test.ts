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
      "## PECOT",
      "## Section 1 - Objectives as Answerable Questions",
      "### Primary estimand (ICH E9(R1))",
      "## Section 2 - Variable Table",
      "## Section 3 - Analysis Map",
      "## Section 4 - General Statistical Rules",
      "### Analysis populations (who is analysed)",
      "## Section 5 - Step-by-Step Analysis Flow",
      "## Section 5A - Assumption Checking",
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
      for (const part of [plan.unadjusted, plan.adjusted, plan.avoid]) {
        if (!part) continue;
        expect(md, `${part} in the Markdown`).toContain(part);
        expect(page, `${part} in the document`).toContain(part);
      }
    }
  });

  it("carries every variable the plan declares", () => {
    for (const variable of sapFixture.variables) {
      expect(md).toContain(variable.label);
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
    expect(buildSapMarkdown(old as never)).toContain("## Section 3 - Analysis Map");
  });
});
