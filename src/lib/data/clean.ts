import { plain } from "../render/plain.ts";
import { slug } from "../crf/columns.ts";
import type { Cell, Change, CleanedDataset, Finding, Grid, Interpretation } from "./types.ts";

/**
 * The sheet, made fit to analyse, with every change written down.
 *
 * There is a hard line through this file. Above it are corrections that cannot
 * alter what a value means: spaces, the spelling of a category the model has
 * already grouped, a marker standing for nothing recorded, a unit repeated in
 * every cell of a column whose header carries it. Those are applied and logged.
 *
 * Below it is everything that would need a judgement about the data itself - a
 * number that looks like a sentinel, a value belonging to no category, the same
 * record entered twice. None of it is touched. It is reported, and the
 * investigator decides, because a silent edit to research data is
 * indistinguishable from fabrication when somebody audits the thesis.
 *
 * Nothing here calls a model. Every judgement a model made arrived in the
 * interpretation, which is what makes the same file clean the same way twice.
 */

const MISSING_MARKERS = new Set([
  "na", "n/a", "n.a.", "nil", "null", "none", "-", "--", "?", ".", "nan", "not recorded",
  "not available", "not done", "unknown",
]);

/** A number wearing a unit or a thousands comma: "29 years", "1,200 ml". */
const NUMBER_WITH_UNIT = /^(-?\d{1,3}(?:,\d{3})*(?:\.\d+)?)\s*[a-zA-Z%/]+\.?$/;
const PLAIN_NUMBER = /^-?\d+(\.\d+)?$/;

/** Numbers a paper form uses to mean "not recorded", which may also be real. */
const SENTINELS = new Set(["999", "9999", "-99", "-999", "888"]);

export type CleanOptions = {
  /** Variable id to the datasheet name the plan and the form already use. */
  columns: Record<string, string>;
};

export function clean(
  grid: Grid,
  headerRow: number,
  interpretation: Interpretation,
  options: CleanOptions,
): CleanedDataset {
  const byIndex = new Map(interpretation.columns.map((c) => [c.index, c]));
  const rawHeaders = grid.rows[headerRow] ?? [];

  // The name a column takes: the plan's datasheet name where a variable claims
  // it, so the spreadsheet, the form and the shell tables cannot call one thing
  // three different words; otherwise the model's clean name, through the same
  // slug the form's own column names go through.
  const headers = rawHeaders.map((header, index) => {
    const mapped = byIndex.get(index);
    const fromPlan = mapped?.variable_id ? options.columns[mapped.variable_id] : undefined;
    return fromPlan || slug(mapped?.clean_name || header || `column ${index + 1}`);
  });

  const changes: Change[] = [];
  const findings: Finding[] = [];
  const body = grid.rows.slice(headerRow + 1);
  const rows: Cell[][] = [];

  body.forEach((raw, r) => {
    // The row as the spreadsheet numbers it, so a person can go and look.
    const rowNumber = headerRow + r + 2;
    const out: Cell[] = [];

    raw.forEach((value, index) => {
      const column = headers[index] ?? `column_${index + 1}`;
      const mapped = byIndex.get(index);
      const before = value;
      let now = value;
      let rule = "";

      const step = (next: string, why: string) => {
        if (next === now) return;
        now = next;
        rule = why;
      };

      step(plain(now).replace(/\s+/g, " ").trim(), "whitespace");
      if (MISSING_MARKERS.has(now.toLowerCase())) step("", "missing marker");

      // A category, written the one way the model grouped it. Text, never a
      // code: a coded column is the thing this was asked not to produce.
      const group = mapped?.categories.find((c) =>
        c.spellings.some((s) => s.toLowerCase() === now.toLowerCase()),
      );
      if (group) step(group.canonical, "category spelling");

      // The unit belongs in the header and the dictionary, not in every cell.
      const withUnit = NUMBER_WITH_UNIT.exec(now);
      if (withUnit) step(withUnit[1].replace(/,/g, ""), "unit in a value");

      if (now !== before) changes.push({ row: rowNumber, column, before, after: now, rule });

      /* ---- reported, never changed ---------------------------------- */

      if (now && PLAIN_NUMBER.test(now) && SENTINELS.has(now)) {
        findings.push({
          severity: "WARN",
          code: "DATA02",
          column,
          row: rowNumber,
          message: `"${now}" is the kind of number a form uses to mean "not recorded". Left exactly as it is: only you can say whether it is a measurement or a marker.`,
        });
      }
      if (now && mapped?.categories.length && !group) {
        findings.push({
          severity: "WARN",
          code: "DATA03",
          column,
          row: rowNumber,
          message: `"${now}" is not one of the categories recorded in this column. Left unchanged, because guessing which was meant would be inventing data.`,
        });
      }

      out.push(now);
    });

    rows.push(out);
  });

  findings.push(...duplicates(headers, rows));

  return { headers, rows, changes, findings, dictionary: dictionary(headers, byIndex, rows) };
}

/**
 * The same record entered twice.
 *
 * Reported and never removed. A repeated row can be a double entry or two
 * patients who genuinely match on everything recorded, and only the
 * investigator knows which.
 */
function duplicates(headers: string[], rows: Cell[][]): Finding[] {
  const seen = new Map<string, number>();
  const out: Finding[] = [];
  rows.forEach((row, r) => {
    if (row.every((cell) => !cell)) return;
    const key = row.join("");
    const first = seen.get(key);
    if (first === undefined) seen.set(key, r + 2);
    else {
      out.push({
        severity: "WARN",
        code: "DATA04",
        column: headers[0] ?? "",
        row: r + 2,
        message: `This row matches row ${first} in every column. Left in place: a repeated row can be a double entry or two patients who genuinely match, and only you can say which.`,
      });
    }
  });
  return out;
}

/** One line per column, describing the data as it now stands. No codes. */
function dictionary(
  headers: string[],
  byIndex: Map<number, Interpretation["columns"][number]>,
  rows: Cell[][],
): CleanedDataset["dictionary"] {
  return headers.map((column, index) => {
    const mapped = byIndex.get(index);
    const values = rows.map((row) => row[index] ?? "");
    const filled = values.filter(Boolean).length;
    const observed = [...new Set(values.filter(Boolean))];

    return {
      column,
      meaning: mapped?.meaning ?? "",
      type: mapped?.categories.length
        ? "category"
        : values.every((v) => !v || PLAIN_NUMBER.test(v))
          ? "number"
          : "text",
      unitsOrCategories:
        mapped?.categories.map((c) => c.canonical).join(", ") ||
        mapped?.unit ||
        (observed.length <= 10 ? observed.join(", ") : ""),
      missing: rows.length ? `${rows.length - filled} of ${rows.length}` : "0 of 0",
    };
  });
}
