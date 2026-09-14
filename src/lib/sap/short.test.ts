import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { idaPreg } from "../facts/fixture.ts";
import { buildSap } from "./build.ts";
import { buildSapDocx } from "./docx.ts";

/**
 * The short plan: the question, the objectives, the outcomes and the analysis
 * map, and nothing after them.
 *
 * Built by the same function as the full plan, with a flag. Two functions would
 * answer the same question differently within a month, which this repository
 * has a test for one directory along.
 */

async function wordText(file: Buffer) {
  const zip = await JSZip.loadAsync(file);
  const xml = await zip.file("word/document.xml")!.async("string");
  return xml
    .replace(/<\/w:p>/g, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

const build = buildSap(idaPreg);

describe("the short plan", () => {
  it("carries the question, the objectives, the outcomes and the map", async () => {
    const short = await wordText(await buildSapDocx(build, "short"));
    expect(short).toContain("PICO");
    expect(short).toContain("Assembled question:");
    expect(short).toContain("Section 1 - Objectives as Answerable Questions");
    expect(short).toContain("Outcomes");
    expect(short).toContain("Analysis Map");

    for (const objective of build.objectives) {
      expect(short, objective.id).toContain(`${objective.id}. ${objective.question}`);
    }
  });

  it("carries no shell tables and no open items", async () => {
    const short = await wordText(await buildSapDocx(build, "short"));
    expect(short).not.toContain("Section 6");
    expect(short).not.toContain("Open items");
    expect(short).not.toContain("Sensitivity analyses");
    // Nor any of the sixteen, which is the point of it being short.
    for (const table of build.tables) {
      expect(short, `T${table.number}`).not.toContain(
        `Table ${table.number}.  ${table.title}`,
      );
    }
  });

  it("says where the tables and the open items are", async () => {
    // A summary that does not say it is one reads as a plan with no tables.
    const short = await wordText(await buildSapDocx(build, "short"));
    expect(short).toContain("SUMMARY");
    expect(short).toContain(`${build.pinned.tables} empty results tables`);
    expect(short).toContain("every open item");
  });

  it("walks each outcome down its chain", async () => {
    const short = await wordText(await buildSapDocx(build, "short"));
    for (const chain of [idaPreg.primary, ...idaPreg.secondary]) {
      expect(short, chain.what).toContain(chain.what);
      expect(short, chain.how).toContain(chain.how);
      expect(short, chain.instrument).toContain(chain.instrument);
    }
    // Visits by name, as everywhere else in the plan.
    expect(short).toContain("Day 0, Week 2, Week 4, Week 6");
    expect(short).not.toContain("D0, W2, W4, W6");
  });

  it("says the same things as the full plan where they overlap", async () => {
    const short = await wordText(await buildSapDocx(build, "short"));
    const full = await wordText(await buildSapDocx(build, "full"));

    expect(short).toContain(build.picot.assembled_question);
    expect(full).toContain(build.picot.assembled_question);
    for (const row of build.picot.rows) {
      expect(short, row.letter).toContain(row.value);
      expect(full, row.letter).toContain(row.value);
    }
    // The map's table numbers point at tables only the full plan prints, and
    // they are the same numbers in both. Matched as a whole entry of the Table
    // cell ("T4, T8"), so the number 8 cannot pass on the strength of "T8a".
    for (const row of build.analysis) {
      if (!row.adjusted?.table) continue;
      const entry = new RegExp(`(^|\\n|, )T${row.adjusted.table}(,|\\n|$)`, "m");
      expect(short, row.objective).toMatch(entry);
      expect(full, row.objective).toMatch(entry);
    }
  });

  it("is the shorter of the two", async () => {
    const short = await wordText(await buildSapDocx(build, "short"));
    const full = await wordText(await buildSapDocx(build, "full"));
    expect(short.length).toBeLessThan(full.length / 2);
  });

  it("does not print the outcomes table twice over in the full plan", async () => {
    // The full plan carries the same definitions in the title and footnote of
    // every table that reports one; printing them again would be two places to
    // edit and two chances to disagree.
    const full = await wordText(await buildSapDocx(build, "full"));
    expect(full).not.toContain("How it is measured");
  });
});
