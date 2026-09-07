import JSZip from "jszip";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TablesPreview } from "../../components/tables-preview.tsx";
import type { ShellTablesSpec } from "../tables/types.ts";
import { buildSapDocx } from "./sap-docx.ts";
import { sapFixture } from "../sap/fixture.ts";
import { tableNumbers } from "../tables/types.ts";

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
 * A document built before the rewrite still opens.
 *
 * Six of these are stored. They carry the roles the merge replaced
 * (`distribution`, `summary`, `effect_unadjusted`), the slots it renumbered
 * (B2, B4, B6), and none of the fields it added: no `reported_as`, no
 * `if_missing`, no `job`, no datasheet columns, no house rules. Opening one is
 * the first thing that happens after a deploy, and nothing else in the suite
 * reads a spec of that shape.
 *
 * Copied from the stored shell tables for the bloodstream infection cohort,
 * reduced to the shapes that differ from what is built now.
 */
const LEGACY: ShellTablesSpec = {
  title: "Community-acquired versus hospital-acquired bloodstream infection",
  groups: ["CA-BSI", "HA-BSI"],
  labels: {
    var_age: "Age",
    var_sex: "Sex",
    var_diabetes: "Diabetes mellitus",
    out_mortality_30d: "30-day all-cause mortality",
    var_pathogen_species: "Causative pathogen species",
  },
  // No `rules`, no `columns`: neither existed when this was written.
  missing_data: "TODO: the protocol does not state a missing-data rule.",
  multiplicity: "TODO: the protocol does not pre-specify a multiplicity strategy.",
  tables: [
    {
      number: 1,
      block: "descriptive",
      role: "descriptive",
      slot: "A1",
      title: "Demographic characteristics by acquisition group (n = 200)",
      columns: ["Variable", "CA-BSI", "HA-BSI", "Total", "Standardised difference"],
      // The shape that reads as nonsense in a grid: an empty label carrying an
      // id, then an indented statistic under it.
      rows: [
        { kind: "variable", label: "", heading: true, variable_id: "var_age" },
        { kind: "category", label: "Mean +/- SD", indent: true },
        { kind: "variable", label: "", heading: true, variable_id: "var_sex" },
        { kind: "category", label: "Male", indent: true },
        { kind: "category", label: "Female", indent: true },
        { kind: "variable", label: "", variable_id: "var_diabetes" },
      ],
      footnote: "No baseline p value is reported.",
    },
    {
      number: 2,
      block: "primary",
      role: "distribution",
      slot: "B1",
      fills: ["P1"],
      outcome_id: "out_mortality_30d",
      title: "30-day all-cause mortality in the whole cohort (n = 200)",
      columns: ["Category", "n / N", "% (95% CI)"],
      rows: [{ kind: "category", label: "30-day all-cause mortality" }],
      test_applied: "Risk difference (Newcombe) and risk ratio, each with 95% CI",
    },
    {
      number: 3,
      block: "primary",
      role: "summary",
      slot: "B2",
      fills: ["P1"],
      outcome_id: "out_mortality_30d",
      title: "30-day all-cause mortality by acquisition group (n = 200)",
      columns: ["Group", "n / N", "% (95% CI)"],
      rows: [
        { kind: "category", label: "CA-BSI" },
        { kind: "category", label: "HA-BSI" },
      ],
      test_applied: "Risk difference (Newcombe) and risk ratio, each with 95% CI",
    },
    {
      number: 4,
      block: "primary",
      role: "effect_unadjusted",
      slot: "B4",
      fills: ["P1"],
      outcome_id: "out_mortality_30d",
      title: "Effect of acquisition group on 30-day all-cause mortality, unadjusted (n = 200)",
      columns: ["Measure", "Estimate", "95% CI", "P value"],
      rows: [
        { kind: "measure", label: "Risk ratio (CA-BSI vs HA-BSI)" },
        { kind: "measure", label: "Number needed to harm (CA-BSI vs HA-BSI)" },
      ],
      footnote: "Not to be reported here: an odds ratio.",
    },
    {
      number: 5,
      block: "secondary",
      role: "distribution",
      slot: "C1.1",
      fills: ["S1"],
      title: "Distribution of causative pathogen species by acquisition group (n = 200)",
      columns: ["Pathogen species", "CA-BSI", "HA-BSI", "Total"],
      rows: [
        { kind: "variable", label: "", heading: true, variable_id: "var_pathogen_species" },
        { kind: "category", label: "E. coli", indent: true },
        { kind: "category", label: "K. pneumoniae", indent: true },
      ],
    },
    {
      number: 6,
      block: "exploratory",
      role: "subgroup",
      slot: "D1",
      fills: ["P1"],
      outcome_id: "out_mortality_30d",
      title: "Effect within prespecified subgroups (n = 200)",
      columns: ["Subgroup", "CA-BSI n/N (%)", "HA-BSI n/N (%)", "Interaction p"],
      rows: [{ kind: "subgroup", label: "TODO: not pre-specified in the protocol" }],
    },
  ],
};

describe("a tables document built before the rewrite", () => {
  it("renders to .docx without throwing, and prints every table", async () => {
    const zip = await JSZip.loadAsync(await buildTablesDocx(LEGACY));
    const visible = (await zip.file("word/document.xml")!.async("string"))
      .replace(/<[^>]+>/g, "")
      .replace(/&amp;/g, "&");

    for (const table of LEGACY.tables) {
      expect(visible, `table ${table.number}`).toContain(`Table ${table.number}: ${table.title}`);
    }
    expect(visible).toContain("Contents: 6 tables");
  });

  it("resolves the ids of a row that carries no wording of its own", async () => {
    const zip = await JSZip.loadAsync(await buildTablesDocx(LEGACY));
    const visible = (await zip.file("word/document.xml")!.async("string")).replace(/<[^>]+>/g, "");
    // The failure this guards against is "var_age" reaching the page, or the
    // row vanishing because its label was empty.
    expect(visible).toContain("Age (mean +/- SD)");
    expect(visible).toContain("Sex (male, female)");
    expect(visible).toContain("Diabetes mellitus");
    expect(visible).not.toMatch(/\bvar_[a-z]/);
  });

  it("survives the slots the rewrite renumbered", async () => {
    // B2, B4 and B6 no longer exist in the skeleton. A slot with no title is
    // printed without its heading rather than crashing or printing "null".
    const zip = await JSZip.loadAsync(await buildTablesDocx(LEGACY));
    const visible = (await zip.file("word/document.xml")!.async("string")).replace(/<[^>]+>/g, "");
    expect(visible).not.toContain("null");
    expect(visible).not.toContain("undefined");
  });

  it("draws a stored spec that predates the grid without a hole in it", () => {
    // The point of this file: a table saved before a field existed still
    // renders. A grid makes that sharper, because a row whose label will not
    // resolve prints as an empty cell rather than as missing prose.
    const markup = renderToStaticMarkup(TablesPreview({ spec: LEGACY }));
    expect(markup).toContain("<table");
    expect(markup).not.toContain("undefined");
    expect(markup).not.toContain("Rows (X)");
  });
});
