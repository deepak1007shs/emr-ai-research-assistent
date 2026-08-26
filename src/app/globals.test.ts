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

  it("sets one root size, so the whole app scales from one number", () => {
    const match = css.match(/html\s*\{\s*font-size:\s*(\d+)px/);
    expect(match, "no root font-size").not.toBeNull();
    const size = Number(match![1]);
    // Larger than the browser default, and not so large it reflows the rail.
    expect(size).toBeGreaterThan(16);
    expect(size).toBeLessThanOrEqual(20);
  });

  it("leaves the downloaded document at its house size", () => {
    // The screen was made bigger; the .docx is a printed page and is not.
    expect(HOUSE_SIZE).toBe(24); // half-points, so 12pt
  });

  it("keeps a monospaced face for the raw markdown only", () => {
    expect(css).toContain("--font-mono: var(--font-geist-mono)");
  });
});
