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

describe("the table plan document", () => {
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

  it("opens by saying how many tables there are, and naming them", async () => {
    // The count is the first thing asked of this document, and nothing computed
    // it before: neither half of the pipeline knows the total until they merge.
    const { visible } = await read();
    expect(visible).toContain(`Contents: ${tablesFixture.tables.length} tables`);
    for (const table of tablesFixture.tables) {
      expect(visible).toContain(`Table ${table.number}.`);
    }
  });

  it("prints every table, in its block", async () => {
    const { visible } = await read();
    for (const table of tablesFixture.tables) {
      expect(visible).toContain(`Table ${table.number}: ${table.title}`);
    }
  });

  it("draws the grid rather than describing the axes", async () => {
    const { document, visible } = await read();
    // This document once drew grids, stopped because the rows printed blank,
    // and described the axes in prose instead. The folding that fixed the prose
    // is what lets the grid come back, so the axes are the table now.
    expect(document).toContain("<w:tbl>");
    expect(visible).not.toContain("Rows (X)");
    expect(visible).not.toContain("Columns (Y)");
    // What a grid cannot carry is still said underneath.
    expect(visible).toContain("Footnote: test used = ");
  });

  it("reports one outcome in one table, with the groups and the estimates in it", async () => {
    const { visible } = await read();
    const table = tablesFixture.tables.find((t) => t.role === "outcome" && t.columns.length > 3)!;
    const at = visible.indexOf(`Table ${table.number}: ${table.title}`);
    expect(at).toBeGreaterThan(-1);
    const entry = visible.slice(at, at + 600);
    // The arms and the estimate computed from them, in the same entry.
    for (const column of table.columns.slice(1)) expect(entry).toContain(column);
    expect(entry).toContain("Cell shows");
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
    expect(visible).toContain("Odds ratio (95% CI)");
    expect(visible).toContain("Risk difference (95% CI)");
    expect(visible).toContain("Not to be reported here:");
  });

  it("reads effect modification from an interaction, never a within-subgroup p", async () => {
    const { visible } = await read();
    expect(visible).toContain("Interaction p");
    expect(visible).toContain("not from the p value within each subgroup");
  });

  it("folds a variable and its parts into one phrase", async () => {
    const { visible } = await read();
    // "Age (years)" as a heading row and "Mean +/- SD" indented under it are
    // one thing to a reader and two rows to the data.
    expect(visible).toContain("Age (mean ± SD)");
    expect(visible).toContain("Age group (< 40 years, 40 to 60 years, > 60 years)");
    // The wording is the plan's, resolved by id, not the wording the row typed.
    expect(visible).toContain("Sex (male, female)");
  });

  it("names the test on every table that reports a comparison", async () => {
    const { visible } = await read();
    expect(visible).toContain("Proportion with exact (Clopper-Pearson) 95% CI");
    expect(visible).toContain("Mann-Whitney U");
    for (const table of tablesFixture.tables) {
      if (!table.test_applied) continue;
      const at = visible.indexOf(`Table ${table.number}: ${table.title}`);
      expect(visible.slice(at, at + 900), `Table ${table.number}`).toContain("Footnote: test used = ");
    }
  });

  it("marks exploratory analyses as not confirmatory", async () => {
    const { visible } = await read();
    expect(visible).toContain("hypothesis-generating");
  });

  it("carries no results, because the data do not exist yet", async () => {
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

/**
 * The tables are drawn, not described.
 *
 * This document once drew them and stopped, because a row carrying a variable
 * id and no label printed as an empty cell: one baseline table ran to 28 rows
 * reading "", "Mean +/- SD", "", "Median (IQR)". The prose replaced it and
 * solved that by folding a sub-row into the row above, which is what makes
 * drawing them possible again - the same folding now names the rows of a grid.
 *
 * A shell table is a table a supervisor signs and a student later fills in. It
 * has to be a table.
 */
describe("the drawn shell tables", () => {
  async function tables() {
    const zip = await JSZip.loadAsync(await buildTablesDocx(tablesFixture));
    const xml = await zip.file("word/document.xml")!.async("string");
    const text = (s: string) => s.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&");
    return [...xml.matchAll(/<w:tbl>[\s\S]*?<\/w:tbl>/g)].map((m) => {
      const rows = [...m[0].matchAll(/<w:tr\b[\s\S]*?<\/w:tr>/g)].map((r) =>
        [...r[0].matchAll(/<w:tc>[\s\S]*?<\/w:tc>/g)].map((c) => text(c[0]).trim()),
      );
      return rows;
    });
  }

  it("draws one grid per table in the plan", async () => {
    expect((await tables()).length).toBe(tablesFixture.tables.length);
  });

  it("heads each grid with the columns the plan named", async () => {
    const drawn = await tables();
    tablesFixture.tables.forEach((table, i) => {
      expect(drawn[i][0]).toEqual(table.columns.map((c) => c.replace(/&/g, "&")));
    });
  });

  it("names every row, and leaves no row unlabelled", async () => {
    // The defect that killed the first attempt: a row whose label came from an
    // id nobody resolved printed blank.
    for (const rows of await tables()) {
      for (const row of rows.slice(1)) expect(row[0]).not.toBe("");
    }
  });

  it("leaves every data cell empty, because that is what a shell is", async () => {
    for (const rows of await tables()) {
      for (const row of rows.slice(1)) {
        for (const cell of row.slice(1)) expect(cell).toBe("");
      }
    }
  });

  it("says under each grid which test fills it", async () => {
    const { visible } = await read();
    expect(visible).toContain("Footnote: test used =");
  });
});
