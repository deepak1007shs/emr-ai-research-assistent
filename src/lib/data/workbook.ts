import ExcelJS from "exceljs";
import type { CleanedDataset } from "./types.ts";

/**
 * What comes back: one workbook, four sheets.
 *
 * They travel together on purpose. A cleaned sheet on its own asks to be
 * trusted; a cleaned sheet with the log of every change made to it, a
 * description of what each column now holds, and a list of what could not be
 * settled without the investigator, asks to be checked. The second is what a
 * thesis can defend.
 *
 * Data is written as text throughout. The investigator asked for no coding, and
 * a spreadsheet that quietly reads "01" as the number one, or "3/4" as a date,
 * has coded the column without being asked.
 */

const SHEETS = {
  data: "Data",
  changes: "Change log",
  dictionary: "Data dictionary",
  findings: "Findings",
} as const;

function header(sheet: ExcelJS.Worksheet, names: string[]) {
  const row = sheet.addRow(names);
  row.font = { bold: true };
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.columns.forEach((column, i) => {
    column.width = Math.min(Math.max((names[i]?.length ?? 8) + 4, 12), 48);
  });
}

/** Every cell written as text, so nothing is re-typed on the way out. */
function addText(sheet: ExcelJS.Worksheet, values: (string | number)[]) {
  const row = sheet.addRow(values.map((v) => String(v)));
  row.eachCell((cell) => {
    cell.numFmt = "@";
    cell.alignment = { vertical: "top", wrapText: true };
  });
  return row;
}

export async function buildWorkbook(cleaned: CleanedDataset): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  // Fixed, because a creation date in the file would mean the same data cleaned
  // twice produced two different bytes, and being able to say "nothing changed"
  // is worth more than knowing when the file was written.
  wb.creator = "EaseMyResearch";
  wb.created = new Date(0);
  wb.modified = new Date(0);

  const data = wb.addWorksheet(SHEETS.data);
  header(data, cleaned.headers);
  for (const row of cleaned.rows) addText(data, row);

  const dictionary = wb.addWorksheet(SHEETS.dictionary);
  header(dictionary, ["Column", "What it holds", "Type", "Units or categories", "Missing"]);
  for (const entry of cleaned.dictionary) {
    addText(dictionary, [
      entry.column,
      entry.meaning,
      entry.type,
      entry.unitsOrCategories,
      entry.missing,
    ]);
  }

  const changes = wb.addWorksheet(SHEETS.changes);
  header(changes, ["Row", "Column", "Was", "Became", "Rule"]);
  for (const change of cleaned.changes) {
    addText(changes, [change.row, change.column, change.before, change.after, change.rule]);
  }
  if (!cleaned.changes.length) {
    addText(changes, ["", "", "", "", "Nothing was changed: the sheet arrived clean."]);
  }

  const findings = wb.addWorksheet(SHEETS.findings);
  header(findings, ["Row", "Column", "What to decide"]);
  for (const finding of cleaned.findings) {
    addText(findings, [finding.row ?? "", finding.column, finding.message]);
  }
  if (!cleaned.findings.length) {
    addText(findings, ["", "", "Nothing here needs a decision."]);
  }

  return Buffer.from(await wb.xlsx.writeBuffer());
}
