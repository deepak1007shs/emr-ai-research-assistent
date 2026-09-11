import fs from "node:fs";
import path from "node:path";

/**
 * The three decision tables, read from the markdown beside this file.
 *
 * They stay as markdown for the same reason the reviewer's knowledge does: a
 * statistician has to be able to read them, argue with a line, and change it,
 * without reading TypeScript. What lives in code is the matching, which is
 * three string keys and a first-match rule.
 *
 * `next.config.ts` traces this directory into the server bundle. A table that
 * fails to load throws at import rather than falling back to a default, because
 * a silent default here would put a plausible wrong test in every footnote.
 */

const DIR = path.join(process.cwd(), "src", "lib", "analysis");

export type Row = Record<string, string>;

/**
 * Every row of the one pipe table in a markdown file, keyed by its headings.
 *
 * Escaped pipes inside a cell are unescaped after the split, so a key like
 * `trial|continuous` can be written in a table whose columns are pipes.
 */
export function parseTable(markdown: string): Row[] {
  const lines = markdown
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("|"));
  if (lines.length < 2) throw new Error("no table found");

  const cells = (line: string) =>
    line
      .replace(/^\|/, "")
      .replace(/\|$/, "")
      .split(/(?<!\\)\|/)
      .map((cell) => cell.trim().replace(/\\\|/g, "|"));

  const headings = cells(lines[0]);
  return lines
    .slice(1)
    .filter((line) => !/^\|[\s:|-]+\|?$/.test(line))
    .map((line) => {
      const values = cells(line);
      return Object.fromEntries(headings.map((h, i) => [h, values[i] ?? ""]));
    });
}

const cache = new Map<string, Row[]>();

function load(file: string): Row[] {
  const hit = cache.get(file);
  if (hit) return hit;
  const rows = parseTable(fs.readFileSync(path.join(DIR, file), "utf8"));
  cache.set(file, rows);
  return rows;
}

export const effectMeasures = () => load("effect-measures.md");
export const tests = () => load("tests.md");
export const binaryModels = () => load("binary-models.md");

/** First row whose Key matches, with `*` standing for any one part. */
export function matchKey(rows: Row[], key: string): Row | null {
  const parts = key.split(/[|/]/);
  for (const row of rows) {
    const candidate = row.Key.split(/[|/]/);
    if (candidate.length !== parts.length) continue;
    if (candidate.every((part, i) => part === "*" || part === parts[i])) {
      return row;
    }
  }
  return null;
}
