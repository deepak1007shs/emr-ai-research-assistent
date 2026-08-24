import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { buildCrfDocx } from "./crf.ts";
import { buildSapDocx } from "./sap.ts";
import { buildShellTablesDocx } from "./shell-tables.ts";
import { HOUSE_FONT } from "./house-style.ts";
import type { StudySpec } from "../study-spec/types.ts";
import exampleJson from "../study-spec/example_study_spec.json";

const example = exampleJson as unknown as StudySpec;

async function parts(buffer: Buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const read = async (name: string) => (await zip.file(name)!.async("string")) ?? "";
  const document = await read("word/document.xml");
  const styles = await read("word/styles.xml");
  const visible = document
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
  return { document, styles, visible };
}

const BUILDERS = [
  ["case record form", buildCrfDocx],
  ["statistical analysis plan", buildSapDocx],
  ["shell tables", buildShellTablesDocx],
] as const;

describe.each(BUILDERS)("%s — house style", (_name, build) => {
  it("is Times New Roman 12pt", async () => {
    const { styles } = await parts(await build(example));
    expect(styles).toContain(HOUSE_FONT);
    expect(styles).toContain('w:sz w:val="24"');
  });

  it("uses no colour but black", async () => {
    const { document, styles } = await parts(await build(example));
    for (const xml of [document, styles]) {
      const colours = [...xml.matchAll(/w:color w:val="([0-9A-Fa-f]{6})"/g)].map((m) => m[1]);
      expect(colours.filter((c) => c.toUpperCase() !== "000000")).toEqual([]);
    }
  });

  it("contains no em dash or smart punctuation", async () => {
    const { visible } = await parts(await build(example));
    for (const glyph of ["—", "–", "‘", "’", "“", "”", "…"]) {
      expect(visible).not.toContain(glyph);
    }
  });

  it("draws no horizontal rules", async () => {
    const { document } = await parts(await build(example));
    expect(document).not.toContain("<w:pBdr>");
  });

  it("stamps the spec version it was built from", async () => {
    const { visible } = await parts(await build(example));
    expect(visible).toContain(`version ${example.spec_version}`);
  });
});

describe("case record form", () => {
  it("collects the raw ingredients of every derived value", async () => {
    const { visible } = await parts(await buildCrfDocx(example));
    expect(visible).toContain("Date of surgery");
    expect(visible).toContain("Date of discharge alive");
    expect(visible).toContain("GAD-7 item 1");
  });

  it("never offers a derived value as a field to fill in", async () => {
    const { visible } = await parts(await buildCrfDocx(example));
    const fieldTable = visible.split("Values computed from this form")[0];
    expect(fieldTable).not.toContain("Postoperative length of stay");
    expect(fieldTable).not.toContain("GAD-7 total score");
  });

  it("lists the computed values separately, with their formulas", async () => {
    const { visible } = await parts(await buildCrfDocx(example));
    const computed = visible.split("Values computed from this form")[1] ?? "";
    expect(computed).toContain("Postoperative length of stay");
    expect(computed).toContain("Date of discharge alive minus date of surgery");
  });

  it("prints the eligibility checklist and the visit window", async () => {
    const { visible } = await parts(await buildCrfDocx(example));
    expect(visible).toContain("Eligibility checklist");
    expect(visible).toContain("ASA physical status I or II");
    // The window is what makes a time point usable: "Day 30" is not a protocol.
    expect(visible).toContain("Time point:");
    expect(visible).toContain("day 30");
    expect(visible).toContain("window:");
  });
});

describe("statistical analysis plan", () => {
  it("carries the full estimand, including the intercurrent-event strategy", async () => {
    const { visible } = await parts(await buildSapDocx(example));
    expect(visible).toContain("Estimand");
    expect(visible).toContain("Intercurrent-event strategy");
    expect(visible).toContain("treatment policy");
  });

  it("states every derivation formula", async () => {
    const { visible } = await parts(await buildSapDocx(example));
    expect(visible).toContain("Derived variables and scores");
    expect(visible).toContain("Sum of all seven GAD-7 item scores");
  });

  it("shows the sample size inputs with their sources", async () => {
    const { visible } = await parts(await buildSapDocx(example));
    expect(visible).toContain("Ausania");
    expect(visible).toContain("two proportions");
  });

  it("names the analysis for every outcome", async () => {
    const { visible } = await parts(await buildSapDocx(example));
    for (const outcome of example.outcomes) {
      expect(visible, `no analysis row for ${outcome.label}`).toContain(outcome.label);
    }
  });
});

describe("shell tables", () => {
  it("numbers every table and puts blocks in order", async () => {
    const { visible } = await parts(await buildShellTablesDocx(example));
    const order = ["Descriptive characteristics", "Primary outcome", "Secondary outcomes", "Exploratory outcomes", "Sensitivity analyses"];
    let cursor = -1;
    for (const heading of order) {
      const at = visible.indexOf(heading);
      expect(at, `${heading} missing or out of order`).toBeGreaterThan(cursor);
      cursor = at;
    }
  });

  it("carries the summary statistic in the row label", async () => {
    const { visible } = await parts(await buildShellTablesDocx(example));
    expect(visible).toContain("Age at enrolment (years), mean (SD)");
    expect(visible).toContain("Sex: Male, n (%)");
  });

  it("marks the reference level", async () => {
    const { visible } = await parts(await buildShellTablesDocx(example));
    expect(visible).toContain("(reference)");
  });

  it("closes every analytical table with the test applied", async () => {
    const { visible } = await parts(await buildShellTablesDocx(example));
    expect(visible).toContain("Test applied: Pearson chi-square test");
    expect(visible).toContain("Test applied: Mann-Whitney U test");
  });

  it("does not say descriptive-only twice when the spec already says it", async () => {
    const { visible } = await parts(await buildShellTablesDocx(example));
    const occurrences = visible.split("no significance testing").length - 1;
    expect(occurrences).toBe(1);
  });
});
