import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { idaPreg } from "../facts/fixture.ts";
import { SapDocument } from "../../components/sap-document.tsx";
import type { FactsSheet } from "../study/types.ts";
import { buildSap } from "./build.ts";
import { buildSapDocx } from "./docx.ts";
import { renderSapMarkdown } from "./markdown.ts";

/**
 * The three renderers, held against each other.
 *
 * The build this one replaced failed exactly here, and the failure is recorded
 * in `a892f21`: three renderers each worked out for itself where a thing went,
 * and they answered differently. This build had the same defect in a smaller
 * place - the markdown found a figure's position by asking whether a fit
 * table's footnote mentioned a mixed model, which is true of every such table,
 * so two repeated outcomes printed four figures under a heading that pinned the
 * count at two, while the Word file put them at the end of the block instead.
 *
 * The repair was to store the answer once, as `figure.after`. This test is what
 * stops it being worked out twice again.
 */

async function wordText(build: Awaited<ReturnType<typeof buildSapDocx>>) {
  const zip = await JSZip.loadAsync(build);
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

/** A study with two repeated outcomes, so there are two figures to misplace. */
const twoFigures: FactsSheet = {
  ...idaPreg,
  secondary: [
    {
      ...idaPreg.primary,
      what: "Change in mean corpuscular volume",
      measures: ["mean_corpuscular_volume"],
      unit: "fL",
      distribution: "normal",
    },
    ...idaPreg.secondary,
  ],
  exploratory_ideas: [],
};

describe.each([
  ["the worked example", idaPreg],
  ["a study with two figures", twoFigures],
])("%s renders the same document three ways", (_name, facts) => {
  const build = buildSap(facts);
  const markdown = renderSapMarkdown(build);

  it("gives every table the same title and footnote in Markdown and in Word", async () => {
    const word = await wordText(await buildSapDocx(build));
    for (const table of build.tables) {
      expect(markdown, `T${table.number} title`).toContain(
        `**Table ${table.number}.  ${table.title}**`,
      );
      expect(word, `T${table.number} title`).toContain(
        `Table ${table.number}.  ${table.title}`,
      );
      const footnote = table.footnote.replace(/\*\*TODO:\*\*/g, "TODO:");
      expect(word, `T${table.number} footnote`).toContain(
        `Footnote: test used = ${footnote}`,
      );
    }
  });

  it("prints each figure exactly once, in the same place, in all three", async () => {
    const word = await wordText(await buildSapDocx(build));
    const html = renderToStaticMarkup(createElement(SapDocument, { build }));

    expect(build.figures.length).toBeGreaterThan(0);
    for (const figure of build.figures) {
      const anchor = build.tables.find((t) => t.number === figure.after)!;
      expect(anchor, `Figure ${figure.number} anchor`).toBeDefined();

      for (const [where, text, mark] of [
        ["markdown", markdown, `**Figure ${figure.number}.`],
        ["word", word, `Figure ${figure.number}.`],
      ] as const) {
        expect(text.split(mark).length - 1, `${where}: Figure ${figure.number}`).toBe(1);
      }
      expect(
        html.split(`Figure {figure.number}`).length,
        "the page renders each figure once",
      ).toBeLessThan(3);

      // Immediately after its anchor, and before whatever follows it.
      const afterAnchor = markdown.indexOf(`Table ${anchor.number}.  ${anchor.title}`);
      const atFigure = markdown.indexOf(`**Figure ${figure.number}.`);
      expect(atFigure).toBeGreaterThan(afterAnchor);
      const next = build.tables[build.tables.indexOf(anchor) + 1];
      if (next) {
        expect(atFigure).toBeLessThan(
          markdown.indexOf(`**Table ${next.number}.  ${next.title}**`),
        );
      }
    }
  });

  it("pins a figure count that is the number of figures printed", () => {
    const printed = (markdown.match(/\*\*Figure \d+\./g) ?? []).length;
    expect(printed).toBe(build.pinned.figures);
    expect(markdown).toContain(
      `${build.pinned.figures} ${build.pinned.figures === 1 ? "figure" : "figures"}`,
    );
  });

  it("puts the same tables in the same blocks on the page as in the file", () => {
    const html = renderToStaticMarkup(createElement(SapDocument, { build }));
    for (const table of build.tables) {
      expect(html, `T${table.number}`).toContain(`Table ${table.number}.`);
    }
    for (const objective of build.objectives) {
      expect(html, objective.id).toContain(objective.id);
    }
  });
});
