import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { buildSapDocx } from "./sap-docx.ts";
import { buildSapMarkdown } from "./sap-md.ts";
import { sapFixture } from "../sap/fixture.ts";
import { chooseTest } from "../sap/choose-test.ts";
import { analysisCell } from "./analysis-cells.ts";
import { tableNumbers } from "../tables/types.ts";
import { tablesFixture } from "../tables/fixture.ts";

/**
 * The short plan is a view of the full one, not a second opinion about it.
 *
 * Nothing is summarised or reworded between them: the same objectives, the same
 * outcomes and the same analysis map, rendered without the sections a
 * statistician does not need in front of them while working. If the two could
 * ever disagree about a test or a table, the short one would be worse than
 * useless, so what they share is held here as hard as what they do not.
 */

const numbers = tableNumbers(tablesFixture);
const shortMd = buildSapMarkdown(sapFixture, numbers, { variant: "short" });
const fullMd = buildSapMarkdown(sapFixture, numbers);

async function docxText(variant: "full" | "short"): Promise<string> {
  const zip = await JSZip.loadAsync(await buildSapDocx(sapFixture, numbers, { variant }));
  return (await zip.file("word/document.xml")!.async("string"))
    .replace(/<[^>]+>/g, " ")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");
}

describe("what the short plan carries", () => {
  it("says which of the two it is, on its face", () => {
    expect(shortMd).toContain("Objectives, outcomes and the analysis map");
  });

  it("carries the three parts and nothing else", async () => {
    for (const text of [shortMd, await docxText("short")]) {
      for (const kept of ["Objectives as Answerable Questions", "Outcomes", "Analysis Map"]) {
        expect(text, `${kept} should be kept`).toContain(kept);
      }
      for (const dropped of [
        "PECOT",
        "Primary estimand",
        "Variable Table",
        "General Statistical Rules",
        "Analysis populations",
        "Step-by-Step Analysis Flow",
        "Assumption Checking",
        "Shell (Dummy) Tables",
        "Sample size.",
      ]) {
        expect(text, `${dropped} should be dropped`).not.toContain(dropped);
      }
    }
  });

  it("numbers no section, because it is not the first three of the full plan", () => {
    // Its middle part is the outcomes, where the full plan's Section 2 is the
    // variable table. Sharing the numbers would say otherwise.
    expect(shortMd).not.toContain("## Section");
    expect(shortMd).toContain("## Objectives as Answerable Questions");
    expect(fullMd).toContain("## Section 1 - Objectives as Answerable Questions");
  });

  it("gives the outcomes a section of their own, with all five questions", () => {
    expect(shortMd).toContain("## Outcomes");
    for (const outcome of sapFixture.outcomes) {
      expect(shortMd).toContain(outcome.what);
      expect(shortMd).toContain(outcome.how);
      expect(shortMd).toContain(outcome.instrument);
      expect(shortMd).toContain(outcome.units);
    }
    // And does not then repeat them as a note under the map.
    expect(shortMd).not.toContain("How each outcome is defined");
    expect(fullMd).toContain("How each outcome is defined");
  });
});

describe("the short plan and the full plan cannot disagree", () => {
  it("print the same analysis cell for every row", async () => {
    const shortDocx = await docxText("short");
    const fullDocx = await docxText("full");

    // The cell itself, not its parts: a row that declines an adjusted model
    // says so here, and the method it declined appears in the full plan's
    // assumption checking rather than in its map.
    for (const row of sapFixture.analyses) {
      const plan = chooseTest(row)!;
      const cell = analysisCell(plan, row);
      for (const [name, text] of [
        ["short markdown", shortMd],
        ["full markdown", fullMd],
        ["short document", shortDocx],
        ["full document", fullDocx],
      ] as [string, string][]) {
        expect(text, `the analysis for ${row.label} differs in the ${name}`).toContain(cell);
      }
    }
  });

  it("state the same reasons and the same warnings under the map", () => {
    for (const row of sapFixture.analyses) {
      const plan = chooseTest(row)!;
      expect(shortMd).toContain(plan.why);
      expect(fullMd).toContain(plan.why);
      if (plan.avoid) {
        expect(shortMd, "the short plan drops a warning").toContain(plan.avoid);
        expect(fullMd).toContain(plan.avoid);
      }
    }
  });

  it("send every objective to the same table", () => {
    for (const row of sapFixture.analyses) {
      for (const number of row.objective_ids.flatMap((id) => numbers[id] ?? [])) {
        expect(shortMd).toContain(`Table ${number}`);
        expect(fullMd).toContain(`Table ${number}`);
      }
    }
  });

  it("ask the same questions", () => {
    for (const objective of sapFixture.objectives) {
      expect(shortMd).toContain(objective.question);
      expect(fullMd).toContain(objective.question);
    }
  });

  it("is shorter, which is the whole point", () => {
    expect(shortMd.length).toBeLessThan(fullMd.length / 2);
  });
});
