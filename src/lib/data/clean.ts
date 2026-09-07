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
  /** Values matching no category, by column, counted rather than listed. */
  const unlisted = new Map<string, Map<string, number>>();
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
      // Gathered per column rather than reported per cell. One real sheet gave
      // a thousand findings for a handful of spellings recurring nine hundred
      // times, which is a wall and not a report.
      if (now && mapped?.categories.length && !group) {
        const seen = unlisted.get(column) ?? new Map<string, number>();
        seen.set(now, (seen.get(now) ?? 0) + 1);
        unlisted.set(column, seen);
      }

      out.push(now);
    });

    rows.push(out);
  });

  for (const [column, values] of unlisted) {
    const total = [...values.values()].reduce((a, b) => a + b, 0);
    const named = [...values.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([value, count]) => `"${value}" (${count})`);
    findings.push({
      severity: "WARN",
      code: "DATA03",
      column,
      row: null,
      message: `${total} value${total === 1 ? "" : "s"} in this column match none of its recorded categories: ${named.join(", ")}${
        values.size > named.length ? `, and ${values.size - named.length} more` : ""
      }. All left unchanged, because guessing which category was meant would be inventing data.`,
    });
  }

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
  // A sheet of one or two columns cannot identify a row. Sixty-one stenosis
  // types in a single column produced fifty-six "duplicate row" findings, and
  // two patients with the same diagnosis are not a double entry.
  if (headers.length < 3) return [];

  const seen = new Map<string, number>();
  const repeats: [number, number][] = [];
  rows.forEach((row, r) => {
    if (row.every((cell) => !cell)) return;
    const key = row.join("\u0000");
    const first = seen.get(key);
    if (first === undefined) seen.set(key, r + 2);
    else repeats.push([r + 2, first]);
  });
  if (!repeats.length) return [];

  // One finding naming the rows, not one finding per row: a sheet with thirty
  // repeats is one thing to look into, not thirty.
  const named = repeats.slice(0, 10).map(([row, first]) => `${row} matches ${first}`);
  return [
    {
      severity: "WARN",
      code: "DATA04",
      column: headers[0] ?? "",
      row: null,
      message: `${repeats.length} row${repeats.length === 1 ? "" : "s"} match another row in every column: ${named.join("; ")}${
        repeats.length > named.length ? `; and ${repeats.length - named.length} more` : ""
      }. All left in place: a repeated row can be a double entry or two patients who genuinely match, and only you can say which.`,
    },
  ];
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
