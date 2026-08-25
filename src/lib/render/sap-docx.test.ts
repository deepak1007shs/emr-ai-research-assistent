import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { buildSapDocx } from "./sap-docx.ts";
import { HOUSE_FONT } from "./house-style.ts";
import type { SapSpec } from "../sap/types.ts";

/** The TAPP study, matching the approved example document. */
const spec: SapSpec = {
  title:
    "Factors Associated with Intraoperative Conversion during TAPP Repair of Ventral Hernia",
  design: "prospective observational cohort",
  guideline: "STROBE",
  aim: "To estimate the rate of intraoperative conversion during elective TAPP repair of ventral hernia, and to identify the factors associated with it.",
  sample_size: 125,
  expected_events: 10,
  objectives: [
    { id: "P1", tier: "primary", question: "What proportion of operations are converted intraoperatively to an alternative technique?" },
    { id: "S1", tier: "secondary", question: "Which factors are associated with conversion?" },
    { id: "S2", tier: "secondary", question: "Does operative duration differ between converted and completed cases?" },
  ],
  variables: [
    { name: "Intraoperative conversion", data_type: "binary", unit_coding: "Yes / No", role: "outcome" },
    { name: "Age", data_type: "continuous", unit_coding: "Years", role: "confounder" },
    {
      name: "Operative duration", data_type: "continuous", unit_coding: "Minutes", role: "mediator",
      exclusion_reason: "It lies on the path between operative difficulty and conversion, so adjusting for it would remove the effect being measured.",
    },
    {
      name: "Postoperative complication", data_type: "binary", unit_coding: "Yes / No", role: "collider",
      exclusion_reason: "It is caused by conversion, so conditioning on it would create a spurious association.",
    },
  ],
  analyses: [
    {
      objective_id: "P1", label: "P1 - conversion rate",
      outcome: "Intraoperative conversion, at the index operation, from the surgeon's record, as a proportion with 95% CI",
      predictors: "(single-group estimate)", data_type: "binary", comparison: "single_group",
      paired: false, table_ref: "T1",
    },
    {
      objective_id: "S1", label: "S1 - factors, adjusted",
      outcome: "Intraoperative conversion",
      predictors: "Age, BMI, previous abdominal surgery", data_type: "binary", comparison: "adjusted",
      paired: false, table_ref: "T2",
    },
    {
      objective_id: "S2", label: "S2 - operative duration",
      outcome: "Operative duration, incision to closure, in minutes",
      predictors: "Conversion status", data_type: "continuous", comparison: "two_groups",
      paired: false, skewed: true, table_ref: "T3",
    },
  ],
};

async function read(s: SapSpec = spec) {
  const zip = await JSZip.loadAsync(await buildSapDocx(s));
  const document = await zip.file("word/document.xml")!.async("string");
  const styles = await zip.file("word/styles.xml")!.async("string");
  const visible = document
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
  return { document, styles, visible };
}

describe("the SAP document", () => {
  it("has the two sections and nothing else", async () => {
    const { visible } = await read();
    expect(visible).toContain("STATISTICAL ANALYSIS PLAN");
    expect(visible).toContain("Section 1 - Objectives as Answerable Questions");
    expect(visible).toContain("Section 2 - Analysis Map");
    for (const dropped of ["Study at a Glance", "Variable Table", "Assumption Checking", "Needs Checking"]) {
      expect(visible, `${dropped} should not appear`).not.toContain(dropped);
    }
  });

  it("numbers the objectives P and S, as questions", async () => {
    const { visible } = await read();
    expect(visible).toContain("Aim");
    expect(visible).toContain("Primary objective(s)");
    expect(visible).toContain("Secondary objectives");
    expect(visible).toContain("P1:");
    expect(visible).toContain("S1:");
  });

  it("carries the five analysis-map columns", async () => {
    const { visible } = await read();
    for (const header of ["Objective", "Outcome", "Predictor(s)", "Data type", "Statistical test"]) {
      expect(visible).toContain(header);
    }
  });

  it("names the test the rules choose, never one the model invented", async () => {
    const { visible } = await read();
    expect(visible).toContain("Clopper-Pearson");        // binary, single group
    expect(visible).toContain("Multivariable binary logistic regression"); // binary, adjusted
    expect(visible).toContain("Mann-Whitney");            // continuous, skewed
    expect(visible).not.toContain("Independent t-test");  // would be wrong for skewed data
  });

  it("points each row at its table", async () => {
    const { visible } = await read();
    expect(visible).toContain("-> T1");
    expect(visible).toContain("-> T3");
  });

  it("declares the adjusted model exploratory when the events cannot afford it", async () => {
    const { visible } = await read();
    // 10 events affords one predictor; three are named.
    expect(visible).toContain("Degrees of freedom");
    expect(visible).toContain("declared exploratory");
  });

  it("names the mediator and the collider, and says neither enters a model", async () => {
    const { visible } = await read();
    expect(visible).toContain("Not adjusted for");
    expect(visible).toContain("is a mediator");
    expect(visible).toContain("is a collider");
    expect(visible).toContain("Neither enters any model");
  });

  it("says so loudly when no rule covers a row", async () => {
    const gap: SapSpec = {
      ...spec,
      analyses: [{ ...spec.analyses[0], data_type: "count", comparison: "agreement" }],
    };
    const { visible } = await read(gap);
    expect(visible).toContain("NO RULE COVERS THIS ROW");
  });

  it("obeys the house style", async () => {
    const { document, styles, visible } = await read();
    expect(styles).toContain(HOUSE_FONT);
    expect(styles).toContain('w:sz w:val="24"');
    for (const xml of [document, styles]) {
      const colours = [...xml.matchAll(/w:color w:val="([0-9A-Fa-f]{6})"/g)].map((m) => m[1]);
      expect(colours.filter((c) => c.toUpperCase() !== "000000")).toEqual([]);
    }
    for (const glyph of ["—", "–", "“", "”", "’"]) expect(visible).not.toContain(glyph);
    expect(document).not.toContain("<w:pBdr>");
  });
});
