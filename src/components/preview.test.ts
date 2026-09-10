import { renderToStaticMarkup } from "react-dom/server";
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { SapPreview } from "./sap-preview.tsx";
import { CrfPreview } from "./crf-preview.tsx";
import { ShellTableSection } from "./tables-preview.tsx";
import { buildSapDocx } from "@/lib/render/sap-docx.ts";
import { buildSapMarkdown } from "@/lib/render/sap-md.ts";
import { buildCrfDocx } from "@/lib/render/crf-docx.ts";
import { sapFixture } from "@/lib/sap/fixture.ts";
import { chooseTest } from "@/lib/sap/choose-test.ts";
import { crfFixture } from "@/lib/crf/fixture.ts";
import { tablesFixture } from "@/lib/tables/fixture.ts";
import { tableNumbers } from "@/lib/tables/types.ts";
import type { ShellTablesSpec } from "@/lib/tables/types.ts";

/**
 * The tables live in the plan now, as Section 6.
 *
 * These checks were written against a standalone tables document. What they
 * assert is still exactly right; only where it prints has changed, so they
 * render the plan carrying the tables rather than the document that is gone.
 */
async function buildTablesDocx(spec: ShellTablesSpec): Promise<Buffer> {
  return buildSapDocx(sapFixture, tableNumbers(spec), { shells: spec });
}


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
      "Analysis Map",
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
      // Both halves of the plan, not a test name. What must not be done with
      // the test is said in the footnote of the table it would be done in,
      // which is where the house blueprint puts it.
      for (const part of [plan!.unadjusted, plan!.adjusted]) {
        if (!part) continue;
        // Agreement, whether or not either prints it: a row that plans no
        // adjusted model says so in both, and neither may say otherwise.
        expect(screen.includes(part), `${part}`).toBe(page.includes(part));
      }
      expect(screen).toContain(plan!.unadjusted);
    }
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

  it("keeps every note, where the downloaded form has none", () => {
    // The other half of a deliberate split. The .docx is headings, tables and
    // answer spaces; the capture rules live here, where an investigator reviews
    // before handing the form out. Pinned from this side too, so a later change
    // cannot drop them from both and leave them readable nowhere.
    const screen = screenText(CrfPreview({ spec: crfFixture }));
    expect(screen).toContain("Calculated from height and weight");
    expect(screen).toContain("worked out from the values above");
    expect(screen).toContain("Each surgeon grades without seeing");
  });

  it("shows the form, which is what the download contains", () => {
    const screen = screenText(CrfPreview({ spec: crfFixture }));
    expect(screen).toContain("Case Record Form");
    expect(screen).toContain("Section A – Form and subject identifiers");
    for (const section of crfFixture.sections) {
      expect(screen, section.title).toContain(section.title);
    }
  });

  it("and not the evidence that the form is complete, which is the other document", () => {
    const screen = screenText(CrfPreview({ spec: crfFixture }));
    for (const heading of [
      "Data collection plan",
      "Exposure, outcome and confounder roll-call",
      "Values calculated",
    ]) {
      expect(screen, heading).not.toContain(heading);
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
  it("carries the blocks in the document's order", () => {
    const screen = screenText(ShellTableSection({ spec: tablesFixture }));
    const order = [
      "Descriptive and baseline characteristics",
      "Primary outcome",
      "Secondary outcomes",
      "Exploratory analyses",
    ];
    // A study with no exploratory objective prints no exploratory block.
    let at = -1;
    let printed = 0;
    for (const block of order) {
      const found = screen.indexOf(block);
      if (found === -1) continue;
      expect(found, `${block} is out of order`).toBeGreaterThan(at);
      at = found;
      printed += 1;
    }
    expect(printed).toBeGreaterThanOrEqual(3);
  });

  it("draws the table on screen as the document draws it", () => {
    const screen = screenText(ShellTableSection({ spec: tablesFixture }));
    expect(screen).toContain("Table 1.");
    for (const column of tablesFixture.tables[0].columns) {
      expect(screen).toContain(column);
    }
    // The axes are the grid now, so the lines that described them are gone.
    expect(screen).not.toContain("Rows (X)");
    expect(screen).not.toContain("Columns (Y)");
    expect(screen).toContain("Footnote: test used");
  });

  it("titles every table the document titles", async () => {
    const screen = screenText(ShellTableSection({ spec: tablesFixture }));
    const page = await pageText(await buildTablesDocx(tablesFixture));
    for (const table of tablesFixture.tables) {
      expect(screen, `table ${table.number} on screen`).toContain(`Table ${table.number}.`);
      expect(page, `table ${table.number} in the document`).toContain(`Table ${table.number}.`);
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
    const screen = screenText(ShellTableSection({ spec: thin as never }));
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
    // first, and before it knew the primary outcome takes a block of tables
    // rather than one. The tables document is the authority on both.
    const numbers = tableNumbers(tablesFixture);
    expect(numbers.P1.length).toBeGreaterThan(1);
    expect(numbers.P1[0]).toBe(3);

    const screen = screenText(SapPreview({ spec: sapFixture, tableNumbers: numbers }));
    const page = await pageText(await buildSapDocx(sapFixture, numbers));

    for (const text of [screen, page]) {
      expect(text).toContain("Table 3");
    }
  });
});

describe("the analysis map stays readable", () => {
  it("keeps the outcome cell short, and says the long part nowhere twice", async () => {
    const spec = structuredClone(sapFixture);
    spec.outcomes[0].how =
      "the surgeon decides in a way described at such length that a cell holding it would be a paragraph rather than a cell";

    const screen = screenText(SapPreview({ spec }));
    const page = await pageText(await buildSapDocx(spec));

    // The definitions that used to run under the map are not part of the house
    // format. The map's cell stays short either way, and the long wording is
    // not repeated anywhere in the plan.
    for (const text of [screen, page]) {
      expect(text.split("described at such length").length - 1).toBeLessThanOrEqual(1);
    }
  });

  it("names every measured outcome the map reports", () => {
    const screen = screenText(SapPreview({ spec: sapFixture }));
    for (const outcome of sapFixture.outcomes) {
      expect(screen).toContain(outcome.what);
    }
  });
});

describe("the plan on screen is the plan you download", () => {
  const SECTIONS = [
    "PICOT/PECO",
    "Section 1 - Objectives as Answerable Questions",
    // Not "Section 3 - Analysis Map". The screen kept the numbered heading for
    // a while after the document dropped it, and this list did not catch it
    // because the shorter title is a substring of the longer one.
    "Analysis Map",
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

  /**
   * One list, checked against all three renderings.
   *
   * Every one of these was removed from the Word file and left in the Markdown,
   * the screen, or both, and the checks did not notice: the section-order test
   * reads headings, and none of these is a heading. Downloading the plan as
   * Markdown gave a different document from downloading it as Word.
   */
  const NOT_IN_THE_HOUSE_FORMAT = [
    "Every objective is phrased as a question",
    "One row per objective",
    "Every empty results table the thesis will contain",
    "Do not edit this document",
    "Analysis population:",
    "Section 2 - Variable Table",
    "Section 3 - Analysis Map",
    "Section 4 - General Statistical Rules",
    "Section 5 - Step-by-Step Analysis Flow",
    "Section 5A",
    "Primary estimand",
    "Contents:",
    "Statistical test -> Table #",
  ];

  it("carries none of it, in any of the three renderings", async () => {
    const screen = screenText(SapPreview({ spec: sapFixture, shells: tablesFixture }));
    const page = await pageText(
      await buildSapDocx(sapFixture, tableNumbers(tablesFixture), { shells: tablesFixture }),
    );
    const md = buildSapMarkdown(sapFixture, tableNumbers(tablesFixture), { shells: tablesFixture });

    for (const gone of NOT_IN_THE_HOUSE_FORMAT) {
      for (const [name, text] of [["screen", screen], ["document", page], ["markdown", md]] as const) {
        expect(text, `"${gone}" in the ${name}`).not.toContain(gone);
      }
    }
  });

  it("heads the analysis map identically in all three renderings", async () => {
    // The Word file's fifth column said "Statistical test" while the screen and
    // the Markdown said "Statistical test -> Table #". Nothing compared them:
    // the section-order checks read headings, and the header row is not one.
    const screen = screenText(SapPreview({ spec: sapFixture }));
    const page = await pageText(await buildSapDocx(sapFixture));
    const md = buildSapMarkdown(sapFixture);

    for (const header of ["Objective", "Outcome", "Predictor(s)", "Data type", "Statistical test"]) {
      for (const [name, text] of [["screen", screen], ["document", page], ["markdown", md]] as const) {
        expect(text, `${header} in the ${name}`).toContain(header);
      }
    }
    for (const text of [screen, page]) {
      expect(text).not.toContain("Statistical test -> Table #");
    }
  });

  it("prints the design and the setting in neither, since the format has no line for them", async () => {
    const screen = screenText(SapPreview({ spec: sapFixture }));
    const page = await pageText(await buildSapDocx(sapFixture));
    for (const [name, text] of [["screen", screen], ["document", page]] as const) {
      expect(text, `the design in the ${name}`).not.toContain(sapFixture.design);
    }
  });

  it("carries none of the sections the house format drops", async () => {
    const screen = screenText(SapPreview({ spec: sapFixture, shells: tablesFixture }));
    const page = await pageText(
      await buildSapDocx(sapFixture, tableNumbers(tablesFixture), { shells: tablesFixture }),
    );
    // Dropped from the rendering, not from the plan: they still choose the
    // tests and write the footnotes. Held on both sides, because a section
    // surviving on screen alone is how the screen and the download drift.
    for (const gone of [
      "Section 3 - Analysis Map",
      "Section 2 - Variable Table",
      "Section 4 - General Statistical Rules",
      "Section 5 - Step-by-Step Analysis Flow",
      "Section 5A - Assumption Checking",
      "Primary estimand",
    ]) {
      expect(screen, `${gone} on screen`).not.toContain(gone);
      expect(page, `${gone} in the document`).not.toContain(gone);
    }
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
    expect(screen).toContain("Analysis Map");
  });
});

describe("a table on screen is the table in the document", () => {
  it("captions, heads and fills every table the same way", async () => {
    const screen = screenText(ShellTableSection({ spec: tablesFixture }));
    const page = await pageText(await buildTablesDocx(tablesFixture));

    for (const table of tablesFixture.tables) {
      const caption = `Table ${table.number}. ${table.title}`;
      expect(screen, `caption on screen`).toContain(caption);
      expect(page, `caption in the document`).toContain(caption);

      for (const column of table.columns.slice(1)) {
        expect(screen, `${column} on screen`).toContain(column);
        expect(page, `${column} in the document`).toContain(column);
      }

      if (table.test_applied) {
        const note = table.test_applied.replace(/\.$/, "");
        expect(screen, `${note} on screen`).toContain(note);
        expect(page, `${note} in the document`).toContain(note);
      }
    }
  });

  it("draws the grid on screen, as the document draws it", () => {
    const markup = renderToStaticMarkup(ShellTableSection({ spec: tablesFixture }));
    expect(markup).toContain("<table");
    // Blank cells, not placeholders: a rule of underscores reads as data that
    // is not there, and a shell table's emptiness is the whole point.
    expect(markup).not.toContain("__");
  });

  it("carries none of the review chrome into what prints", () => {
    const markup = renderToStaticMarkup(
      ShellTableSection({ spec: tablesFixture, flagged: new Set([1]) }),
    );
    // The flag is a note from the rail, not part of the document.
    expect(markup).toContain("Flagged in review");
    expect(markup).toContain("no-print");
  });
});

describe("Section 6 on screen and in the download", () => {
  const primaryTable = tablesFixture.tables.find((t) => t.block === "primary")!;

  /**
   * The bug this pins. The tables moved into the plan as Section 6, the Word
   * and Markdown renderings were updated, and the screen was not: it kept a
   * sentence saying the tables were "in the Shell Tables document that
   * accompanies this plan", and that document had been deleted in the same
   * change. A reader looking at the plan was pointed at nothing.
   */
  it("draws the tables on screen, and names the ones the document names", () => {
    const screen = screenText(
      SapPreview({ spec: sapFixture, shells: tablesFixture }),
    );
    expect(screen).not.toContain("document that accompanies this plan");
    for (const table of tablesFixture.tables) {
      expect(screen, `Table ${table.number}`).toContain(table.title);
    }
  });

  /**
   * The house documents go from the lettered family heading straight to
   * "Table N.". There was an "Analysis population:" line here, composed from
   * the plan; the document that is being matched carries no line under any
   * family heading, and says who was analysed in the sensitivity table's rows
   * and its footnote instead.
   */
  it("goes from the family heading straight to the first table", async () => {
    const page = await pageText(await buildTablesDocx(tablesFixture));
    const screen = screenText(
      SapPreview({ spec: sapFixture, shells: tablesFixture }),
    );

    for (const text of [page, screen]) {
      expect(text).not.toContain("Analysis population:");
      const at = text.indexOf("B. Primary outcome");
      expect(at).toBeGreaterThan(-1);
      expect(
        text.slice(at, at + "B. Primary outcome".length + 40),
      ).toContain(`Table ${primaryTable.number}.`);
    }
  });


  it("says the tables are not built yet rather than pointing nowhere", () => {
    const screen = screenText(SapPreview({ spec: sapFixture }));
    expect(screen).toContain("Section 6");
    expect(screen).toContain("not been built yet");
    expect(screen).not.toContain("accompanies this plan");
  });
});
