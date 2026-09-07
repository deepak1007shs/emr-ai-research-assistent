import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { buildWorkbook } from "./workbook.ts";
import { readWorkbook } from "./read.ts";
import type { CleanedDataset } from "./types.ts";

/**
 * The four sheets travel together on purpose.
 *
 * A cleaned sheet on its own asks to be trusted. A cleaned sheet with the log
 * of every change, a description of each column, and a list of what only the
 * investigator can settle, asks to be checked instead.
 */

const cleaned: CleanedDataset = {
  headers: ["sr_no", "age_yrs", "sex"],
  rows: [
    ["1", "34", "Male"],
    ["2", "51", "Female"],
  ],
  changes: [{ row: 2, column: "sex", before: "m", after: "Male", rule: "category spelling" }],
  findings: [
    { severity: "WARN", code: "DATA02", column: "age_yrs", row: 3, message: "999 may be a marker." },
  ],
  dictionary: [
    { column: "sr_no", meaning: "Serial number", type: "number", unitsOrCategories: "", missing: "0 of 2" },
    { column: "age_yrs", meaning: "Age", type: "number", unitsOrCategories: "years", missing: "0 of 2" },
    { column: "sex", meaning: "Sex", type: "category", unitsOrCategories: "Male, Female", missing: "0 of 2" },
  ],
};

async function sheets(buffer: Buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  return wb.worksheets.map((w) => w.name);
}

describe("the workbook that comes back", () => {
  it("carries the data, the log, the dictionary and the findings", async () => {
    expect(await sheets(await buildWorkbook(cleaned))).toEqual([
      "Data",
      "Data dictionary",
      "Change log",
      "Findings",
    ]);
  });

  it("writes the cleaned rows under their new names", async () => {
    const grid = await readWorkbook(await buildWorkbook(cleaned), "Data");
    expect(grid.rows[0]).toEqual(["sr_no", "age_yrs", "sex"]);
    expect(grid.rows[1]).toEqual(["1", "34", "Male"]);
  });

  it("keeps a leading zero, because a study id is not a number", async () => {
    const withId = { ...cleaned, rows: [["007", "34", "Male"]] };
    const grid = await readWorkbook(await buildWorkbook(withId), "Data");
    expect(grid.rows[1][0]).toBe("007");
  });

  it("says so plainly when there was nothing to change", async () => {
    const spotless = { ...cleaned, changes: [], findings: [] };
    const book = await buildWorkbook(spotless);
    const log = await readWorkbook(book, "Change log");
    expect(log.rows[1].join(" ")).toContain("arrived clean");
    const findings = await readWorkbook(book, "Findings");
    expect(findings.rows[1].join(" ")).toContain("needs a decision");
  });

  it("writes the same bytes for the same data", async () => {
    // The property the whole design exists for: a second run of the same file
    // is provably the same file, so "nothing changed" can be said with a hash.
    const a = await buildWorkbook(cleaned);
    const b = await buildWorkbook(cleaned);
    expect(a.equals(b)).toBe(true);
  });
});
