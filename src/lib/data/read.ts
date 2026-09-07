import ExcelJS from "exceljs";
import type { Cell, Grid } from "./types.ts";

/**
 * A spreadsheet, read as it is.
 *
 * Nothing here decides which row is the header, which column matters, or what a
 * value means. Those are three separate judgements made later and recorded, and
 * a reader that anticipated any of them would destroy the evidence the change
 * log is written from: a row silently dropped here can never be shown to the
 * investigator as a row that was dropped.
 *
 * Everything comes out as text. A spreadsheet has no types, only formatting: an
 * id typed as 0012 and a date shown as 05/09 are what somebody wrote, and
 * deciding they are a number and a date is interpretation.
 */

export class DatasetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DatasetError";
  }
}

/** Excel's own epoch, for a cell that carries a date rather than a string. */
function textOf(value: unknown): Cell {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) {
    // Written back in the sheet's own order rather than an ISO stamp nobody
    // typed; normalising a date is a cleaning decision, made later and logged.
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${pad(value.getUTCDate())}/${pad(value.getUTCMonth() + 1)}/${value.getUTCFullYear()}`;
  }
  if (typeof value === "object") {
    const rich = value as { richText?: { text: string }[]; text?: string; result?: unknown };
    if (Array.isArray(rich.richText)) return rich.richText.map((r) => r.text).join("");
    // A formula cell carries what it evaluated to, which is what a reader sees.
    if (rich.result !== undefined) return textOf(rich.result);
    if (typeof rich.text === "string") return rich.text;
    return "";
  }
  return String(value);
}

/** Pads every row to the widest, so a short row is not read as missing columns. */
function square(rows: Cell[][]): Cell[][] {
  const width = rows.reduce((n, row) => Math.max(n, row.length), 0);
  return rows.map((row) => {
    const out = row.slice(0, width);
    while (out.length < width) out.push("");
    return out;
  });
}

/**
 * @param sheetName the sheet to read; the first with any content by default.
 */
export async function readWorkbook(buffer: Buffer, sheetName?: string): Promise<Grid> {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  } catch {
    throw new DatasetError("That file could not be read as a spreadsheet.");
  }

  const sheet = sheetName
    ? wb.worksheets.find((w) => w.name === sheetName)
    : wb.worksheets.find((w) => w.rowCount > 0);
  if (!sheet) {
    throw new DatasetError(
      sheetName ? `The workbook has no sheet called "${sheetName}".` : "The workbook is empty.",
    );
  }

  // Bounded by the sheet's own dimensions, not by rowCount and columnCount.
  // Those two report the extent of anything Excel has touched, including
  // formatting on empty cells: one real thesis sheet of 101 rows reported 2009
  // by 238, and asking for every cell in that rectangle materialised four
  // hundred thousand empty cell objects and never finished. Dimensions is the
  // used range.
  const box = sheet.dimensions as unknown as
    | { model?: { top: number; left: number; bottom: number; right: number } }
    | undefined;
  const lastRow = Math.min(box?.model?.bottom ?? sheet.rowCount, sheet.rowCount);
  const lastColumn = Math.min(box?.model?.right ?? sheet.columnCount, sheet.columnCount);

  const rows: Cell[][] = [];
  for (let r = 1; r <= lastRow; r += 1) {
    // `values` is a sparse 1-based array and costs one read for the whole row.
    // getCell would create every cell it was asked for, which is what made the
    // rectangle above expensive as well as large.
    const values = sheet.getRow(r).values as unknown[];
    const cells: Cell[] = [];
    for (let c = 1; c <= lastColumn; c += 1) cells.push(textOf(values?.[c]));
    rows.push(cells);
  }

  return { sheet: sheet.name, rows: square(rows) };
}

/**
 * A comma-separated file, which is what a good many files called Excel are.
 *
 * Written out rather than taken from a library because the rules are small and
 * the failure mode of getting them wrong - a quoted "Smith, John" split into
 * two columns - is silent and shifts every column after it.
 */
export function readCsv(text: string, filename: string): Grid {
  const rows: Cell[][] = [];
  let row: Cell[] = [];
  let field = "";
  let quoted = false;

  const endField = () => {
    row.push(field);
    field = "";
  };
  const endRow = () => {
    endField();
    rows.push(row);
    row = [];
  };

  const body = text.replace(/^﻿/, "");
  for (let i = 0; i < body.length; i += 1) {
    const ch = body[i];
    if (quoted) {
      if (ch === '"') {
        if (body[i + 1] === '"') {
          field += '"';
          i += 1;
        } else quoted = false;
      } else field += ch;
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === ",") endField();
    else if (ch === "\r") continue;
    else if (ch === "\n") endRow();
    else field += ch;
  }
  if (field || row.length) endRow();

  return { sheet: filename, rows: square(rows) };
}
