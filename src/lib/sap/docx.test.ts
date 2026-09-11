import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { idaPreg } from "../facts/fixture.ts";
import { buildSap } from "./build.ts";
import { buildSapDocx } from "./docx.ts";
import { renderSapMarkdown } from "./markdown.ts";

/** The document's text, with the XML stripped out of it. */
async function wordText(file: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(file);
  const xml = await zip.file("word/document.xml")!.async("string");
  return xml
    .replace(/<\/w:p>/g, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

describe("the plan as a Word file", () => {
  it("carries the same headings as the markdown", async () => {
    const build = buildSap(idaPreg);
    const word = await wordText(await buildSapDocx(build));
    const markdown = renderSapMarkdown(build);

    for (const heading of markdown
      .split("\n")
      .filter((line) => line.startsWith("#"))
      .map((line) => line.replace(/^#+\s*/, ""))) {
      // The one difference is the title, which the markdown shouts and the Word
      // file centres.
      expect(word).toContain(heading === "STATISTICAL ANALYSIS PLAN" ? heading : heading);
    }
  });

  it("carries every table, with its title and its footnote", async () => {
    const build = buildSap(idaPreg);
    const word = await wordText(await buildSapDocx(build));
    for (const table of build.tables) {
      expect(word).toContain(`Table ${table.number}.  ${table.title}`);
      expect(word).toContain(`Footnote: test used = ${table.footnote.replace(/\*\*TODO:\*\*/g, "TODO:")}`);
    }
  });

  it("uses Times New Roman and nothing else", async () => {
    const zip = await JSZip.loadAsync(await buildSapDocx(buildSap(idaPreg)));
    const styles = await zip.file("word/styles.xml")!.async("string");
    const fonts = [...styles.matchAll(/w:ascii="([^"]+)"/g)].map((m) => m[1]);
    expect([...new Set(fonts)]).toEqual(["Times New Roman"]);
  });

  it("writes an open item in bold rather than as two asterisks", async () => {
    const word = await wordText(await buildSapDocx(buildSap(idaPreg)));
    expect(word).toContain("TODO:");
    expect(word).not.toContain("**TODO:**");
  });

  it("leaves every value cell blank", async () => {
    const build = buildSap(idaPreg);
    const zip = await JSZip.loadAsync(await buildSapDocx(build));
    const xml = await zip.file("word/document.xml")!.async("string");

    const strip = (chunk: string) => chunk.replace(/<[^>]+>/g, "").trim();
    const grids = [...xml.matchAll(/<w:tbl>([\s\S]*?)<\/w:tbl>/g)].map((m) =>
      [...m[1].matchAll(/<w:tr>([\s\S]*?)<\/w:tr>/g)].map((row) =>
        [...row[1].matchAll(/<w:tc>([\s\S]*?)<\/w:tc>/g)].map((cell) => strip(cell[1])),
      ),
    );

    // The PICOT table and the Analysis Map are grids with text in every cell,
    // on purpose. A shell table is found by its header row, and it is the shell
    // tables that must be empty.
    for (const table of build.tables) {
      const grid = grids.find(
        (rows) => rows[0]?.join("\u0000") === table.columns.join("\u0000"),
      );
      expect(grid, `table ${table.number}`).toBeDefined();
      for (const row of grid!.slice(1)) {
        expect(row.slice(1).every((cell) => cell === ""), row[0]).toBe(true);
      }
    }
  });
});
