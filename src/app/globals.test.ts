import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { HOUSE_FONT, HOUSE_SIZE } from "@/lib/render/house-style.ts";

/**
 * The screen and the page are one document.
 *
 * The house rule for a generated .docx is Times New Roman, black on white. The
 * app reads the same documents before they are downloaded, so it uses the same
 * face: a supervisor checking a plan on screen and handing over the Word file
 * should not be looking at two different things.
 */

const css = await readFile(new URL("./globals.css", import.meta.url), "utf8");

describe("the app's own type", () => {
  it("is the same family the documents are set in", () => {
    expect(css).toContain(`--font-document: "${HOUSE_FONT}"`);
    // Every Tailwind family token resolves to it, so no utility escapes.
    expect(css).toContain("--font-sans: var(--font-document)");
    expect(css).toContain("--font-serif: var(--font-document)");
    expect(css).toMatch(/body\s*\{[^}]*font-family:\s*var\(--font-document\)/);
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
