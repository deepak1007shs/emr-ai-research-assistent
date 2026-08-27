import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { buildTablesDocx } from "./tables-docx.ts";
import { HOUSE_FONT } from "./house-style.ts";
import { tablesFixture } from "../tables/fixture.ts";

async function read() {
  const zip = await JSZip.loadAsync(await buildTablesDocx(tablesFixture));
  const document = await zip.file("word/document.xml")!.async("string");
  const styles = await zip.file("word/styles.xml")!.async("string");
  const visible = document
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
  return { document, styles, visible };
}

describe("the shell tables document", () => {
  it("puts the blocks in order", async () => {
    const { visible } = await read();
    const order = [
      "Descriptive and baseline characteristics",
      "Primary outcome",
      "Secondary outcomes",
      "Exploratory analyses",
    ];
    // A study with no exploratory objective prints no exploratory block, so
    // only the blocks that appear are checked, and they must appear in order.
    let cursor = -1;
    let printed = 0;
    for (const heading of order) {
      const at = visible.indexOf(heading);
      if (at === -1) continue;
      expect(at, `${heading} is out of order`).toBeGreaterThan(cursor);
      cursor = at;
      printed += 1;
    }
    expect(printed).toBeGreaterThanOrEqual(3);
  });

  it("reports the primary outcome with a block of tables, not one table", async () => {
    const forPrimary = tablesFixture.tables.filter((t) => t.block === "primary");
    expect(forPrimary.length).toBeGreaterThan(1);
    const { visible } = await read();
    for (const table of forPrimary) {
      expect(visible).toContain(`Table ${table.number}: ${table.title}`);
    }
  });

  it("numbers and titles each table with its denominator", async () => {
    const { visible } = await read();
    expect(visible).toContain("Table 1: Demographic profile");
    expect(visible).toContain("(n = 125)");
  });

  it("puts the unadjusted and adjusted estimate side by side, never a model number", async () => {
    const { visible } = await read();
    expect(visible).toContain("Unadjusted odds ratio (95% CI)");
    expect(visible).toContain("Adjusted odds ratio (95% CI)");
    expect(visible).not.toMatch(/Model\s*\d/);
  });

  it("names the estimate the plan chose, and rules out the one it did not", async () => {
    const { visible } = await read();
    expect(visible).toContain("Odds ratio (Yes vs No)");
    expect(visible).toContain("Risk difference (Yes vs No)");
    expect(visible).toContain("Not to be reported here:");
  });

  it("reads effect modification from an interaction, never a within-subgroup p", async () => {
    const { visible } = await read();
    expect(visible).toContain("Interaction p");
    expect(visible).toContain("not from the p value within each subgroup");
  });

  it("uses a heading row for a variable and indents its parts", async () => {
    const { visible } = await read();
    expect(visible).toContain("Age group");
    expect(visible).toContain("Mean ± SD");
    expect(visible).toContain("40 to 60 years");
  });

  it("names the test under every analytical table", async () => {
    const { visible } = await read();
    expect(visible).toContain("Footnote: test used = Proportion with exact (Clopper-Pearson) 95% CI");
    expect(visible).toContain("Footnote: test used = Mann-Whitney U");
  });

  it("marks exploratory analyses as not confirmatory", async () => {
    const { visible } = await read();
    expect(visible).toContain("hypothesis-generating");
  });

  it("leaves the cells empty, because a shell is not a result", async () => {
    const { visible } = await read();
    // No figure from the worked results document should have leaked in.
    expect(visible).not.toMatch(/\d+\.\d+\s*±\s*\d+\.\d+/);
    expect(visible).not.toMatch(/p\s*=\s*0\.\d+/);
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
