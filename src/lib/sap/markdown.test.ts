import { describe, expect, it } from "vitest";
import { idaPreg } from "../facts/fixture.ts";
import { bannedWordsIn } from "../render/house-style.ts";
import { buildSap } from "./build.ts";
import { renderSapMarkdown } from "./markdown.ts";
import {
  MAP_LINE,
  PICOT_LINE,
  SECTION_1_LINE,
  SECTION_6_LINE,
} from "./markdown.ts";

const sap = () => renderSapMarkdown(buildSap(idaPreg));

describe("the plan, end to end", () => {
  it("passes every check on the worked example", () => {
    expect(buildSap(idaPreg).checks.filter((c) => !c.pass)).toEqual([]);
  });

  it("builds the same file twice, byte for byte", () => {
    // The rebuild's own acceptance test. The build it replaced gave 16, 18, 19
    // and 20 tables on four runs of one protocol.
    expect(sap()).toBe(sap());
  });

  it("renders the sections in the order 7.2 gives", () => {
    const text = sap();
    const order = [
      "# STATISTICAL ANALYSIS PLAN",
      "## PICO",
      "## Section 1 - Objectives as Answerable Questions",
      "## Analysis Map",
      "## Section 6 - Shell (Dummy) Tables",
    ];
    let last = -1;
    for (const heading of order) {
      const at = text.indexOf(heading);
      expect(at, heading).toBeGreaterThan(last);
      last = at;
    }
  });

  it("carries the fixed rationale lines word for word", () => {
    for (const fixed of [PICOT_LINE, SECTION_1_LINE, MAP_LINE, SECTION_6_LINE]) {
      expect(sap()).toContain(`*${fixed}*`);
    }
  });

  it("prints the frame the facts locked, not the other one", () => {
    expect(sap()).toContain("## PICO\n");
    expect(sap()).not.toContain("## PECO");
  });

  it("pins the table count at the top of Section 6", () => {
    expect(sap()).toContain(
      "This plan contains 16 numbered tables (T1 to T16), 4 fit tables and 1 figure.",
    );
  });

  it("draws every table with a bold title and an italic footnote", () => {
    const { tables } = buildSap(idaPreg);
    const text = sap();
    for (const table of tables) {
      expect(text).toContain(`**Table ${table.number}.  ${table.title}**`);
      expect(text).toContain(`*Footnote: test used = ${table.footnote}*`);
    }
  });

  it("leaves every value cell empty", () => {
    // Checked against the build rather than by pattern: every row of every
    // table carries its label in the first column and nothing anywhere else.
    const { tables } = buildSap(idaPreg);
    const lines = sap().split("\n");
    for (const table of tables) {
      // Searched from this table's own title, because two tables may carry a
      // row with the same label: dietary pattern is a baseline characteristic
      // in Table 1 and the thing Table 16 splits the sample by.
      const start = lines.indexOf(`**Table ${table.number}.  ${table.title}**`);
      expect(start, `table ${table.number}`).toBeGreaterThan(-1);
      for (const row of table.rows) {
        const line = lines
          .slice(start)
          .find((l) => l.startsWith(`| ${row.label.replace(/\|/g, "\\|")} |`));
        expect(line, `${table.number}: ${row.label}`).toBeDefined();
        const cells = line!.split("|").slice(2, -1);
        expect(cells.every((cell) => cell.trim() === "")).toBe(true);
        expect(cells).toHaveLength(table.columns.length - 1);
      }
    }
  });

  it("writes the open items as bold TODOs and does not answer them", () => {
    const text = sap();
    expect(text).toContain("## Open items");
    expect(text).toContain("**TODO:**");
    expect(text).toContain("Name the statistical software and its version.");
  });

  it("uses no vocabulary that marks prose as machine-written", () => {
    expect(bannedWordsIn(sap())).toEqual([]);
  });

  it("uses no em dash, en dash, minus sign or smart quote", () => {
    expect(sap()).not.toMatch(/[—–−‘’“”…]/);
  });

  it("names the test under every table, with its fallback", () => {
    expect(sap()).toContain(
      "*Footnote: test used = Log-binomial regression, planned on the assumption that the outcome is common (fallback: Modified Poisson regression with robust variance)*",
    );
  });

  it("puts the figure where a reader has just read the slopes", () => {
    const text = sap();
    expect(text.indexOf("**Figure 1.")).toBeGreaterThan(
      text.indexOf("**Table 6a."),
    );
    expect(text.indexOf("**Figure 1.")).toBeLessThan(text.indexOf("**Table 7."));
  });

  it("closes the primary block with the sensitivity table", () => {
    const text = sap();
    expect(text.indexOf("**Table 9.  Sensitivity analyses**")).toBeLessThan(
      text.indexOf("### Secondary outcomes"),
    );
    expect(text.indexOf("**Table 8.")).toBeLessThan(
      text.indexOf("**Table 9.  Sensitivity analyses**"),
    );
  });

  it("prints the general rules once rather than in sixteen footnotes", () => {
    // Gap G6: the population line refers to rules the printed format has no
    // section for, so the format gains one short block.
    const text = sap();
    expect(text).toContain("### General rules");
    expect(text.match(/never carried forward/g)).toHaveLength(1);
  });
});
