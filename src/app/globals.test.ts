import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { HOUSE_FONT, HOUSE_SIZE } from "@/lib/render/house-style.ts";

/**
 * The screen and the page are one document.
 *
 * The house rule for a generated .docx is Times New Roman, black on white, and
 * the app shows those documents before they are downloaded. So the document is
 * set in the face it prints in: a supervisor checking a plan on screen and
 * handing over the Word file must not be looking at two different things.
 *
 * The application around the document is not. The rail, the toolbar and the
 * buttons are not a proof of any page, and setting them in Times bought nothing
 * and cost the whole app its appearance.
 */

const css = await readFile(new URL("./globals.css", import.meta.url), "utf8");

describe("the app's own type", () => {
  it("sets the document in the face it prints in", () => {
    expect(css).toContain(`--font-document: "${HOUSE_FONT}"`);
    // Applied to the sheet, which is the document and nothing else.
    expect(css).toMatch(/\.sheet\s*\{[^}]*font-family:\s*var\(--font-document\)/);
    expect(css).toContain("--font-serif: var(--font-document)");
  });

  it("sets the application around it in something else", () => {
    // The change this replaced an assertion for: the chrome was Times too, and
    // that one fact was most of why the app looked older than it is.
    expect(css).toMatch(/body\s*\{[^}]*font-family:\s*var\(--font-ui\)/);
    expect(css).toContain("--font-sans: var(--font-ui)");
    expect(css).not.toMatch(/body\s*\{[^}]*font-family:\s*var\(--font-document\)/);
  });

  it("falls back to faces a machine without Times actually has", () => {
    expect(css).toContain("Liberation Serif");
    expect(css).toMatch(/--font-document:[^;]*serif;/);
  });

  it("sizes the whole app from one number", () => {
    // The design states its sizes in pixels against a 16px base. They are held
    // here in rem against that base, so the scale is the only dial.
    expect(css).toMatch(/html\s*\{\s*font-size:\s*calc\(16px \* var\(--ui-scale\)\)/);

    const match = css.match(/--ui-scale:\s*([\d.]+)/);
    expect(match, "no --ui-scale").not.toBeNull();
    const scale = Number(match![1]);
    // 1 is the design at its stated sizes. Above it for legibility, and short
    // of the point where a 15rem sidebar takes a third of a laptop screen.
    expect(scale).toBeGreaterThanOrEqual(1);
    expect(scale).toBeLessThanOrEqual(1.6);
  });

  it("holds the design's fixed dimensions in rem, so they scale with it", () => {
    for (const [token, rem] of [
      ["--header-h", "3.25rem"],   // 52px
      ["--rail-w", "15.25rem"],    // 244px
      ["--review-w", "23.25rem"],  // 372px
      ["--sheet-w", "47.5rem"],    // 760px
    ]) {
      expect(css, token).toContain(`${token}: ${rem}`);
    }
  });

  it("keeps the rail's width in rem, so it grows with the type it holds", () => {
    // A rail pinned in pixels would crowd its own filenames the next time the
    // root size moves.
    expect(css).toMatch(/--rail-w:\s*[\d.]+rem/);
  });

  it("sizes everything in rem, so the root size actually moves it", () => {
    // A px length in a layout class would not scale with the root, and the app
    // would come apart unevenly as the size changes.
    expect(css).not.toMatch(/--header-h:\s*\d+px/);
    expect(css).toMatch(/--header-h:\s*[\d.]+rem/);
    expect(css).not.toMatch(/--rail-w:\s*\d+px/);
    expect(css).not.toMatch(/--review-w:\s*\d+px/);
  });

  it("leaves the downloaded document at its house size", () => {
    // The screen was made bigger; the .docx is a printed page and is not.
    expect(HOUSE_SIZE).toBe(24); // half-points, so 12pt
  });

  it("keeps a monospaced face for the raw markdown only", () => {
    expect(css).toContain("--font-mono: var(--font-geist-mono)");
  });
});

describe("the panels either side of the document", () => {
  it("are set a size larger, without moving the document", () => {
    // The middle is the size the .docx is, because the point of reading it here
    // is that it is the same document. The panels are not a document.
    expect(css).toMatch(/@utility panel-type \{\s*--type-scale:\s*1\.15/);
    expect(css).toMatch(/--type-scale:\s*1;/);
  });

  it("scale by multiplying the design's sizes, not by restating them", () => {
    // Restated sizes drift from the design the first time one is edited.
    for (const token of ["--text-2xs", "--text-xs", "--text-sm", "--text-base", "--text-lg"]) {
      expect(css, token).toMatch(
        new RegExp(`${token}: calc\\([\\d.]+rem \\* var\\(--type-scale\\)\\)`),
      );
    }
  });
});

describe("white and blue", () => {
  it("keeps every surface white and the canvas a faint blue-grey", () => {
    expect(css).toMatch(/--surface:\s*#ffffff/);
    expect(css).toMatch(/--bg:\s*#f6f8fc/);
  });

  it("carries one blue, with its own light and dark tints", () => {
    for (const token of ["--brand", "--brand-ink", "--brand-50", "--brand-100", "--brand-200"]) {
      expect(css, token).toMatch(new RegExp(`${token}:\\s*#[0-9a-f]{6}`, "i"));
    }
    expect(css).toMatch(/--brand:\s*#3b7db8/);
  });

  it("names the text that sits on the blue rather than assuming white", () => {
    // White on a light blue is what the dark palette would give if this were
    // hardcoded, which is how the button text disappeared once before.
    expect(css).toMatch(/--accent-foreground:/);
    expect(css.match(/--accent-foreground:/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
  });
});
