/**
 * House-style text, with no dependency on the Word library.
 *
 * This lives apart from house-style.ts so that a page rendering a document on
 * screen can normalise its text the same way the .docx does, without pulling
 * `docx` into the browser bundle. What you read on screen and what you download
 * pass through the same function.
 */

const SUBSTITUTIONS: [RegExp, string][] = [
  [/—/g, " - "], // em dash
  [/–/g, "-"], // en dash
  [/−/g, "-"], // minus sign
  [/[‘’‛]/g, "'"], // smart single quotes
  [/[“”‟]/g, '"'], // smart double quotes
  [/…/g, "..."], // ellipsis
  [/ /g, " "], // non-breaking space
  [/[•●▪]/g, ""], // stray bullet glyphs
  [/[→⇒]/g, "to"], // arrows
  [/×/g, "x"], // multiplication sign
];

/**
 * Makes a string safe for a house-style document: no em dashes, no smart
 * punctuation, no decorative glyphs.
 *
 * Applied at the renderer boundary rather than to the stored spec, so the
 * Markdown artifacts and the canonical builder are untouched.
 */
export function plain(value: string | null | undefined): string {
  let text = String(value ?? "");
  for (const [pattern, replacement] of SUBSTITUTIONS) {
    text = text.replace(pattern, replacement);
  }
  return text.replace(/[ \t]{2,}/g, " ").trim();
}

/** Collapses newlines the way a table cell needs, then applies the house style. */
export function line(value: string | null | undefined): string {
  return plain(String(value ?? "").replace(/\s*\n\s*/g, " "));
}
