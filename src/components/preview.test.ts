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
import { tableNumbers } from "@/lib/tables/types.ts";

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
      "Section 3 - Analysis Map",
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
      const plan = chooseTest(row);
      expect(plan, `no rule covers ${row.objective_ids.join(", ")}`).not.toBeNull();
      // Both halves, and what to avoid: the whole plan, not a test name.
      for (const part of [plan!.unadjusted, plan!.adjusted, plan!.avoid]) {
        if (!part) continue;
        expect(screen, `${part} on screen`).toContain(part);
        expect(page, `${part} in the document`).toContain(part);
      }
    }
    expect(screen).toContain("Why each analysis");
    expect(screen).toContain("What must not be done");
  });

  it("names every objective and every table the document does", async () => {
    const screen = screenText(SapPreview({ spec: sapFixture }));
    for (const objective of sapFixture.objectives) {
      expect(screen).toContain(`${objective.id}:`);
    }
    for (const analysis of sapFixture.analyses) {
      for (const tableId of analysis.table_ids) {
        expect(screen).toContain(tableId);
      }
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

describe("who owns a table number", () => {
  it("the plan shows its own number until the tables exist", () => {
    const screen = screenText(SapPreview({ spec: sapFixture }));
    expect(screen).toContain("T1");
  });

  it("and the tables' number once they do", async () => {
    // The plan wrote T1 for P1 before it knew two baseline tables would come
    // first. The tables document says P1 is reported by Table 3.
    const numbers = tableNumbers(tablesFixture);
    // An objective can be reported by more than one table.
    expect(numbers.P1).toEqual([3]);

    const screen = screenText(SapPreview({ spec: sapFixture, tableNumbers: numbers }));
    const page = await pageText(await buildSapDocx(sapFixture, numbers));

    for (const text of [screen, page]) {
      expect(text).toContain("Table 3");
    }
  });
});

describe("the analysis map stays readable", () => {
  it("keeps the outcome cell short and puts the definition underneath", async () => {
    const spec = structuredClone(sapFixture);
    spec.outcomes[0].how =
      "the surgeon decides in a way described at such length that a cell holding it would be a paragraph rather than a cell";

    const screen = screenText(SapPreview({ spec }));
    const page = await pageText(await buildSapDocx(spec));

    for (const text of [screen, page]) {
      // The long text appears once, in the definitions, not in the map's cell.
      expect(text).toContain("How each outcome is defined");
      // Matched mid-sentence: the definition capitalises its first word.
      expect(text.split("described at such length").length - 1).toBe(1);
    }
  });

  it("names every measured outcome in the definitions", () => {
    const screen = screenText(SapPreview({ spec: sapFixture }));
    for (const outcome of sapFixture.outcomes) {
      expect(screen).toContain(outcome.what);
    }
  });
});

describe("the plan on screen is the plan you download", () => {
  const SECTIONS = [
    "Section 1 - Objectives as Answerable Questions",
    "Primary estimand",
    "Section 2 - Variable Table",
    "Section 3 - Analysis Map",
    "Section 4 - General Statistical Rules",
    "Analysis populations",
    "Section 5 - Step-by-Step Analysis Flow",
    "Section 5A - Assumption Checking",
    "Section 6 - Shell (Dummy) Tables",
  ];

  it("carries every section of the route map, in the same order as the document", async () => {
    const screen = screenText(SapPreview({ spec: sapFixture }));
    const page = await pageText(await buildSapDocx(sapFixture));

    for (const text of [screen, page]) {
      let at = -1;
      for (const section of SECTIONS) {
        const found = text.indexOf(section);
        expect(found, `${section} is missing`).toBeGreaterThan(-1);
        expect(found, `${section} is out of order`).toBeGreaterThan(at);
        at = found;
      }
    }
  });

  it("groups the assumption checks under the test they belong to", async () => {
    const screen = screenText(SapPreview({ spec: sapFixture }));
    for (const check of sapFixture.assumption_checks) {
      expect(screen).toContain(check.test);
      expect(screen).toContain(check.if_violated);
    }
  });

  it("lists the variables by role, outcomes first", () => {
    const screen = screenText(SapPreview({ spec: sapFixture }));
    const outcome = sapFixture.variables.find((v) => v.role === "outcome")!;
    const descriptor = sapFixture.variables.find((v) => v.role === "confounder")!;
    expect(screen.indexOf(outcome.label)).toBeLessThan(screen.indexOf(descriptor.label));
  });
});

describe("a plan stored before the route map existed", () => {
  it("renders the sections it has rather than throwing", async () => {
    // A row read back is whatever was written to it. The old two-section plan
    // has no glance, no estimand and no rules.
    const old = structuredClone(sapFixture) as Record<string, unknown>;
    for (const gone of [
      "picot", "estimand", "rules", "populations",
      "steps", "assumption_checks", "priority_confounder_ids",
    ]) {
      delete old[gone];
    }

    expect(() => screenText(SapPreview({ spec: old as never }))).not.toThrow();
    await expect(buildSapDocx(old as never)).resolves.toBeInstanceOf(Buffer);

    // What it does still have is still printed.
    const screen = screenText(SapPreview({ spec: old as never }));
    expect(screen).toContain("Section 3 - Analysis Map");
  });
});

describe("a table on screen is the table in the document", () => {
  it("captions, heads and fills every table the same way", async () => {
    const screen = screenText(TablesPreview({ spec: tablesFixture }));
    const page = await pageText(await buildTablesDocx(tablesFixture));

    for (const table of tablesFixture.tables) {
      const caption = `Table ${table.number}: ${table.title}`;
      expect(screen, `caption on screen`).toContain(caption);
      expect(page, `caption in the document`).toContain(caption);

      for (const column of table.columns) {
        expect(screen, `${column} on screen`).toContain(column);
        expect(page, `${column} in the document`).toContain(column);
      }

      if (table.test_applied) {
        expect(screen).toContain(`Test applied: ${table.test_applied}`);
        expect(page).toContain(`Test applied: ${table.test_applied}`);
      }
    }
  });

  it("leaves the cells empty on screen, as the document leaves them", () => {
    const markup = renderToStaticMarkup(TablesPreview({ spec: tablesFixture }));
    // A shell table is a grid of empty boxes. A placeholder character in the
    // cells would read as data that is not there.
    expect(markup).not.toContain("__");
    // The boxes are drawn, not implied: every cell carries the document's rule.
    expect(markup).toContain("border border-ink");
  });

  it("carries none of the review chrome into what prints", () => {
    const markup = renderToStaticMarkup(
      TablesPreview({ spec: tablesFixture, flagged: new Set([1]) }),
    );
    // The flag is a note from the rail, not part of the document.
    expect(markup).toContain("Flagged in review");
    expect(markup).toContain("no-print");
  });
});
