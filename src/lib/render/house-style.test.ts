import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { buildSapDocx } from "./sap-docx.ts";
import { buildCrfDocx } from "./crf-docx.ts";
import { buildTablesDocx } from "./tables-docx.ts";
import { AI_VOCABULARY, HOUSE_FONT } from "./house-style.ts";
import { sapFixture } from "../sap/fixture.ts";
import { crfFixture } from "../crf/fixture.ts";
import { tablesFixture } from "../tables/fixture.ts";

/**
 * The house style, on every document rather than one of them.
 *
 * The banned vocabulary was written down, fed to the model, and never checked
 * against the application's own prose. So "robust" sat in two footnotes this
 * code writes itself, in a document handed to an examiner, while the model was
 * being told not to use it.
 */

async function read(buffer: Buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const document = await zip.file("word/document.xml")!.async("string");
  const styles = await zip.file("word/styles.xml")!.async("string");
  const visible = document
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
  return { document, styles, visible };
}

const documents = async (): Promise<[string, Awaited<ReturnType<typeof read>>][]> => [
  ["the full plan", await read(await buildSapDocx(sapFixture, {}))],
  ["the short plan", await read(await buildSapDocx(sapFixture, {}, { variant: "short" }))],
  ["the case record form", await read(await buildCrfDocx(crfFixture, "form"))],
  ["the collection plan", await read(await buildCrfDocx(crfFixture, "plan"))],
  ["the shell tables", await read(await buildTablesDocx(tablesFixture))],
];

describe("every document the app hands over", () => {
  it("is Times New Roman at 12pt, in black", async () => {
    for (const [name, { document, styles }] of await documents()) {
      expect(styles, name).toContain(HOUSE_FONT);
      expect(styles, name).toContain('w:sz w:val="24"');
      const colours = [...document.matchAll(/w:color w:val="([0-9A-Fa-f]{6})"/g)].map((m) => m[1]);
      expect(colours.filter((c) => c.toUpperCase() !== "000000"), name).toEqual([]);
      expect(document, `${name} has a paragraph border`).not.toContain("<w:pBdr>");
    }
  });

  it("carries no em dash, en dash or smart punctuation", async () => {
    for (const [name, { visible }] of await documents()) {
      for (const glyph of ["—", "–", "“", "”", "’", "…"]) {
        expect(visible, `${name} contains ${glyph}`).not.toContain(glyph);
      }
    }
  });

  it("uses none of the vocabulary the model is forbidden", async () => {
    // The application writes prose too: every footnote, every note under a
    // block, every explanation of what a table is for. It is held to the same
    // list, which is what nothing was doing.
    for (const [name, { visible }] of await documents()) {
      for (const word of AI_VOCABULARY) {
        // "robust variance" and "robust standard errors" are the statistical
        // terms and are not the failure this looks for.
        const found = new RegExp(`\\b${word}\\b(?! (variance|standard error))`, "i").exec(visible);
        expect(found?.[0], `${name} uses "${word}": ...${visible.slice(Math.max(0, (found?.index ?? 0) - 50), (found?.index ?? 0) + 40)}...`).toBeUndefined();
      }
    }
  });

  it("never prints a raw id where a name belongs", async () => {
    for (const [name, { visible }] of await documents()) {
      const id = /\b(var|out)_[a-z0-9_]+/.exec(visible);
      expect(id?.[0], `${name} prints ${id?.[0]}`).toBeUndefined();
    }
  });

  it("never leaks undefined, NaN or an object into the page", async () => {
    for (const [name, { visible }] of await documents()) {
      for (const leak of ["undefined", "[object Object]", "NaN"]) {
        expect(visible, `${name} contains ${leak}`).not.toContain(leak);
      }
    }
  });

  it("and the two plans are actually different documents", async () => {
    // The short plan is the full one cut to what a statistician works from. A
    // test that renders both and compares nothing would pass on one document
    // returned twice, which is what an earlier check of mine did.
    const [, full] = (await documents())[0];
    const [, short] = (await documents())[1];
    expect(short.visible.length).toBeLessThan(full.visible.length);
  });
});
