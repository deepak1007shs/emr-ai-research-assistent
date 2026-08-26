import { renderToStaticMarkup } from "react-dom/server";
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { SapPreview } from "./sap-preview.tsx";
import { CrfPreview } from "./crf-preview.tsx";
import { TablesPreview } from "./tables-preview.tsx";
import { buildSapDocx } from "@/lib/render/sap-docx.ts";
import { buildCrfDocx } from "@/lib/render/crf-docx.ts";
import { buildTablesDocx } from "@/lib/render/tables-docx.ts";
import { sapFixture } from "@/lib/sap/fixture.ts";
import { chooseTest } from "@/lib/sap/choose-test.ts";
import { crfFixture } from "@/lib/crf/fixture.ts";
import { tablesFixture } from "@/lib/tables/fixture.ts";

/**
 * What you read on screen is what you download.
 *
 * Each preview mirrors a Word renderer, and a mirror that drifts is worse than
 * no mirror: a supervisor would approve one document and hand over another. So
 * both are rendered from the same fixture and their visible text compared.
 */

/** The text of a rendered React tree, tags and entities stripped. */
function screenText(element: React.ReactElement): string {
  return strip(renderToStaticMarkup(element));
}

/** The text of a .docx, tags and entities stripped. */
async function pageText(buffer: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(buffer);
  return strip(await zip.file("word/document.xml")!.async("string"));
}

function strip(xml: string): string {
  return xml
    .replace(/<[^>]+>/g, " ")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#x27;/g, "'").replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

describe("the SAP preview", () => {
  it("carries the headings the document carries", async () => {
    const screen = screenText(SapPreview({ spec: sapFixture }));
    for (const heading of [
      "Section 1 - Objectives as Answerable Questions",
      "Aim",
      "Primary objective(s)",
      "Secondary objectives",
      "Section 2 - Analysis Map",
    ]) {
      expect(screen, heading).toContain(heading);
    }
  });

  it("shows the test the document shows, chosen by the same rule", async () => {
    const screen = screenText(SapPreview({ spec: sapFixture }));
    const page = await pageText(await buildSapDocx(sapFixture));

    // The test is not written into this test: it is read from the rule table,
    // the same way both renderers read it. If either named its own test, or
    // the rule table changed under one of them, this parts company.
    for (const row of sapFixture.analyses) {
      const chosen = chooseTest(row);
      expect(chosen, `no rule covers ${row.objective_id}`).not.toBeNull();
      expect(screen, `${chosen!.test} on screen`).toContain(chosen!.test);
      expect(page, `${chosen!.test} in the document`).toContain(chosen!.test);
    }
    expect(screen).toContain("Why each test");
  });

  it("names every objective and every table the document does", async () => {
    const screen = screenText(SapPreview({ spec: sapFixture }));
    for (const objective of sapFixture.objectives) {
      expect(screen).toContain(`${objective.id}:`);
    }
    for (const analysis of sapFixture.analyses) {
      expect(screen).toContain(analysis.table_id);
    }
  });
});

describe("the CRF preview", () => {
  it("draws the answer spaces the printed form draws", async () => {
    const screen = screenText(CrfPreview({ spec: crfFixture }));
    // Pre-printed boxes, a ruled date, and a unit on a number.
    expect(screen).toContain("☐ Male");
    expect(screen).toContain("___ / ___ / ______");
    expect(screen).toContain("years");
  });

  it("carries the plan and the form, as the document does", () => {
    const screen = screenText(CrfPreview({ spec: crfFixture }));
    for (const heading of [
      "Data collection plan",
      "Exposure, outcome and confounder roll-call",
      "Form & Subject Identifiers",
      "Values calculated from this form, not collected on it",
    ]) {
      expect(screen, heading).toContain(heading);
    }
  });

  it("prints the plan's wording, exactly as the document does", async () => {
    const spec = structuredClone(crfFixture);
    const field = spec.sections[0].fields.find((f) => f.variable_id === "var_age")!;
    field.label = "Patient age at operation";

    const screen = screenText(CrfPreview({ spec }));
    const page = await pageText(await buildCrfDocx(spec));

    for (const text of [screen, page]) {
      expect(text).toContain("Age");
      expect(text).not.toContain("Patient age at operation");
    }
  });
});

describe("the shell tables preview", () => {
  it("carries the four blocks in the document's order", () => {
    const screen = screenText(TablesPreview({ spec: tablesFixture }));
    const order = [
      "Descriptive and baseline characteristics",
      "Primary outcome",
      "Secondary outcomes",
      "Exploratory analyses",
    ];
    let at = -1;
    for (const block of order) {
      const found = screen.indexOf(block);
      expect(found, `${block} is missing`).toBeGreaterThan(-1);
      expect(found, `${block} is out of order`).toBeGreaterThan(at);
      at = found;
    }
  });

  it("keeps the cells empty: a shell is not a result", () => {
    const screen = screenText(TablesPreview({ spec: tablesFixture }));
    expect(screen).toContain("Table 1:");
    // Every column header the document prints.
    for (const column of tablesFixture.tables[0].columns) {
      expect(screen).toContain(column);
    }
  });

  it("titles every table the document titles", async () => {
    const screen = screenText(TablesPreview({ spec: tablesFixture }));
    const page = await pageText(await buildTablesDocx(tablesFixture));
    for (const table of tablesFixture.tables) {
      expect(screen, `table ${table.number} on screen`).toContain(`Table ${table.number}:`);
      expect(page, `table ${table.number} in the document`).toContain(`Table ${table.number}:`);
    }
  });
});

describe("a stored document that predates a field", () => {
  it("the SAP preview renders rather than throwing", () => {
    // A row read back from the database is whatever was stored, not whatever
    // the current type says. A preview that throws takes the whole page down.
    const thin = { ...structuredClone(sapFixture), outcomes: undefined, variables: undefined };
    expect(() => screenText(SapPreview({ spec: thin as never }))).not.toThrow();
  });

  it("the CRF preview renders without a label registry", () => {
    const thin = { ...structuredClone(crfFixture), labels: undefined };
    const screen = screenText(CrfPreview({ spec: thin as never }));
    // It falls back to the wording the form itself carries.
    expect(screen).toContain("Age");
  });

  it("the tables preview renders without a label registry", () => {
    const thin = { ...structuredClone(tablesFixture), labels: undefined };
    const screen = screenText(TablesPreview({ spec: thin as never }));
    expect(screen).toContain("Sex");
  });
});
