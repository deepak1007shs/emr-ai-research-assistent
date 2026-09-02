import { readFileSync } from "node:fs";
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { buildSapDocx } from "./sap-docx.ts";
import { buildCrfDocx } from "./crf-docx.ts";
import { buildTablesDocx } from "./tables-docx.ts";
import { HOUSE_FONT, bannedWordsIn } from "./house-style.ts";
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
      // Correct medical and statistical terms are excused by the one function
      // the model's instruction is written from, so the check the documents are
      // held to and the check the model is held to cannot drift apart.
      expect(bannedWordsIn(visible), name).toEqual([]);
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

describe("the banned vocabulary knows medicine from filler", () => {
  it("excuses the terms a clinician and a statistician actually write", () => {
    // The application told the model to lay out "Vital signs" in slot A4 and,
    // in another file, never to write "vital". Its own check would have failed
    // the correct document.
    for (const term of [
      "Vital signs at admission",
      "Vital status at 30 days",
      "Forced vital capacity",
      "modified Poisson with robust variance",
      "robust standard errors",
      "Comprehensive metabolic panel",
      "Pivotal trial",
    ]) {
      expect(bannedWordsIn(term), term).toEqual([]);
    }
  });

  it("still catches the filler those words were banned for", () => {
    expect(bannedWordsIn("a robust and comprehensive approach")).toEqual(
      expect.arrayContaining(["robust", "comprehensive"]),
    );
    expect(bannedWordsIn("It is vital to delve into this")).toEqual(
      expect.arrayContaining(["delve", "vital"]),
    );
  });

  it("is the same rule the model is given", () => {
    // The two had already drifted: the check excused "robust variance" and the
    // instruction to the model did not.
    for (const path of [
      "src/lib/tables/knowledge/shell-tables.md",
      "src/lib/protocol/knowledge/workflow.md",
    ]) {
      const text = readFileSync(path, "utf8");
      expect(text, path).toContain("vital signs");
      expect(text, path).toContain("robust variance");
    }
  });
});
