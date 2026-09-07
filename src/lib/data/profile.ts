import type { ColumnProfile, DatasetProfile, Grid } from "./types.ts";

/**
 * What a sheet looks like, in the few hundred words a model can be shown.
 *
 * The rows themselves are never sent anywhere. A study of five thousand
 * patients and a study of fifty produce a profile of the same size, and the one
 * thing a profile must carry is every distinct spelling of a category, because
 * "M", "male" and "Male" being one thing is the judgement the model is for.
 */

/** Text that stands for "not recorded" wherever it appears. */
const MISSING_MARKERS = [
  "na", "n/a", "n.a.", "nil", "null", "none", "-", "--", "?", ".", "nan", "not recorded",
  "not available", "not done", "unknown",
];

const isMissing = (value: string) =>
  !value.trim() || MISSING_MARKERS.includes(value.trim().toLowerCase());

/** A number, allowing a thousands comma and a trailing unit somebody typed. */
const NUMERIC = /^[<>~]?\s*-?\d{1,3}(,\d{3})*(\.\d+)?\s*[a-zA-Z%/µ°]*\.?$/;
const DATE = /^\d{1,4}[/.-]\d{1,2}[/.-]\d{1,4}$/;

/**
 * The header row, guessed.
 *
 * A real sheet often opens with the study's name and a blank line. The header is
 * the first row that names things: several cells, all short, none repeated, and
 * none of them a number. The model is asked to confirm it, because a merged
 * title or two stacked header rows will defeat any rule this size.
 */
export function guessHeaderRow(grid: Grid): number {
  const limit = Math.min(grid.rows.length, 20);
  for (let r = 0; r < limit; r += 1) {
    const cells = grid.rows[r].map((c) => c.trim()).filter(Boolean);
    if (cells.length < 2) continue;
    if (cells.some((c) => NUMERIC.test(c))) continue;
    if (cells.some((c) => c.length > 60)) continue;
    if (new Set(cells.map((c) => c.toLowerCase())).size !== cells.length) continue;
    // A header names at least half the width of the sheet it heads.
    if (cells.length * 2 < grid.rows[r].length) continue;
    return r;
  }
  return 0;
}

function looksLike(values: string[], distinctTotal: number): ColumnProfile["looks"] {
  if (!values.length) return "empty";
  const share = (test: RegExp) =>
    values.filter((v) => test.test(v.trim())).length / values.length;

  if (share(DATE) >= 0.8) return "date";
  if (share(NUMERIC) >= 0.8) return "number";
  // A category is a short word drawn from a small set, and drawn twice at
  // least: a column where every row differs is free text however short it is.
  const small = distinctTotal <= 15 && values.every((v) => v.trim().length <= 30);
  if (small && distinctTotal < values.length) return "category";
  return "text";
}

export function profile(grid: Grid, headerRow: number): DatasetProfile {
  const headers = grid.rows[headerRow] ?? [];
  const body = grid.rows.slice(headerRow + 1);

  const columns = headers.map((header, index): ColumnProfile => {
    const raw = body.map((row) => row[index] ?? "");
    const present = raw.filter((v) => !isMissing(v)).map((v) => v.trim());

    const counts = new Map<string, number>();
    // Where two values are equally common the one seen first is listed first:
    // an alphabetical tie-break would put "F" above "male" and read as though
    // the sheet were sorted, which it is not.
    const firstSeen = new Map<string, number>();
    present.forEach((value, at) => {
      counts.set(value, (counts.get(value) ?? 0) + 1);
      if (!firstSeen.has(value)) firstSeen.set(value, at);
    });

    const markers = [
      ...new Set(
        raw
          .map((v) => v.trim())
          .filter((v) => v && MISSING_MARKERS.includes(v.toLowerCase())),
      ),
    ];

    return {
      index,
      header: header.trim(),
      filled: present.length,
      missing: raw.length - present.length,
      looks: looksLike(present, counts.size),
      distinct: [...counts.entries()]
        .sort((a, b) => b[1] - a[1] || firstSeen.get(a[0])! - firstSeen.get(b[0])!)
        .slice(0, 50)
        .map(([value, count]) => ({ value, count })),
      distinctTotal: counts.size,
      missingMarkers: markers,
    };
  });

  return { sheet: grid.sheet, headerRow, rowCount: body.length, columns };
}
