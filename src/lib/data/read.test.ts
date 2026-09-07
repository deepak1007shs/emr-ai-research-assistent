import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { readCsv, readWorkbook } from "./read.ts";

/**
 * Reading is not interpreting.
 *
 * Nothing here decides which row is the header or what a value means. A file
 * that arrives with a title above the table, a blank column somebody tabbed
 * into, and a legend underneath is read exactly as it is, because a reader that
 * quietly drops a row has already destroyed the evidence for the change log.
 */

async function sheetOf(rows: (string | number | null)[][]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Data");
  for (const row of rows) ws.addRow(row);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

describe("reading a workbook", () => {
  it("keeps every row, including the ones above the table", async () => {
    const grid = await readWorkbook(
      await sheetOf([
        ["Tendon study - master sheet", null, null],
        [null, null, null],
        ["Sr", "Age", "Sex"],
        [1, 34, "M"],
      ]),
    );
    expect(grid.rows).toHaveLength(4);
    expect(grid.rows[0][0]).toBe("Tendon study - master sheet");
    expect(grid.rows[2]).toEqual(["Sr", "Age", "Sex"]);
  });

  it("reads every cell as text, and does not round a number on the way in", async () => {
    const grid = await readWorkbook(await sheetOf([["Hb"], [12.5], [9]]));
    expect(grid.rows[1][0]).toBe("12.5");
    expect(grid.rows[2][0]).toBe("9");
  });

  it("squares the grid, so a short row is not a missing column", async () => {
    const grid = await readWorkbook(await sheetOf([["a", "b", "c"], [1]]));
    expect(grid.rows[1]).toEqual(["1", "", ""]);
  });

  it("reads the used range, not everything Excel has ever touched", async () => {
    // A real thesis sheet of 101 rows reported 2009 by 238, because rowCount
    // and columnCount cover anything formatted rather than anything filled.
    // Asking for every cell in that rectangle created four hundred thousand
    // empty cells and did not finish in five minutes.
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Data");
    ws.addRow(["Sr", "Age"]);
    ws.addRow([1, 34]);
    ws.getRow(900).height = 20; // touched, never filled
    const grid = await readWorkbook(Buffer.from(await wb.xlsx.writeBuffer()));

    expect(ws.rowCount).toBeGreaterThan(100);
    expect(grid.rows.length).toBeLessThan(10);
    expect(grid.rows[1]).toEqual(["1", "34"]);
  });

  it("names the sheet it read", async () => {
    expect((await readWorkbook(await sheetOf([["a"]]))).sheet).toBe("Data");
  });
});

describe("reading a csv", () => {
  it("handles quoted fields with commas and doubled quotes inside them", () => {
    const grid = readCsv('id,note\n1,"Smith, John"\n2,"He said ""no"""\n', "d.csv");
    expect(grid.rows[1]).toEqual(["1", "Smith, John"]);
    expect(grid.rows[2]).toEqual(["2", 'He said "no"']);
  });

  it("keeps a blank line rather than skipping it", () => {
    const grid = readCsv("a,b\n\n1,2\n", "d.csv");
    expect(grid.rows).toHaveLength(3);
    expect(grid.rows[1]).toEqual(["", ""]);
  });

  it("survives windows line endings", () => {
    expect(readCsv("a,b\r\n1,2\r\n", "d.csv").rows[1]).toEqual(["1", "2"]);
  });
});
