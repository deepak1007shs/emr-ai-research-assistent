import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { composeAnswers, dataBlock, decisionsBlock, parseIssueAnswers } from "./answers.ts";
import type { ColumnProfile, DatasetProfile } from "../data/types.ts";
import type { ActionSpec } from "./schema.ts";

/**
 * An answers box that is silently ignored is worse than none: the investigator
 * believes the decision was taken into account, and the document says otherwise.
 * These hold the composition to that.
 */

const actions = {
  subtitle: "Issues & Required Changes",
  issues_table: {
    rows: [
      ["Primary outcome", "No single primary outcome is defined.", "Choose one.", "1"],
      ["Sample size", "Powered on the wrong outcome.", "Recalculate.", "2"],
      ["Eligibility", "ASA III is in neither rule.", "State it.", "3"],
    ],
  },
} as unknown as ActionSpec;

describe("composeAnswers", () => {
  it("returns null when nothing has been answered", () => {
    expect(composeAnswers(null, null, actions)).toBeNull();
    expect(composeAnswers("   ", {}, actions)).toBeNull();
  });

  it("names the issue each answer settles", () => {
    const composed = composeAnswers(null, { "0": "The conversion rate." }, actions);
    expect(composed).toContain("Issue 1 (Primary outcome)");
    expect(composed).toContain("No single primary outcome is defined.");
    expect(composed).toContain("Decision: The conversion rate.");
  });

  it("keeps the action list's order, which is the order of priority", () => {
    const composed = composeAnswers(
      null,
      { "2": "ASA I to II only.", "0": "The conversion rate." },
      actions,
    )!;
    expect(composed.indexOf("Issue 1")).toBeLessThan(composed.indexOf("Issue 3"));
  });

  it("carries the general box after the numbered answers", () => {
    const composed = composeAnswers("Follow-up is 30 days.", { "0": "The rate." }, actions)!;
    expect(composed).toContain("Follow-up is 30 days.");
    expect(composed.indexOf("Issue 1")).toBeLessThan(composed.indexOf("Follow-up is 30 days."));
  });

  it("still carries an answer whose issue has gone", () => {
    // The decision was taken. Losing it because the list moved would be worse
    // than showing it without its heading.
    const composed = composeAnswers(null, { "9": "Exclude redo repairs." }, actions)!;
    expect(composed).toContain("Exclude redo repairs.");
  });

  it("works with no action list at all", () => {
    const composed = composeAnswers("A decision.", { "0": "Another." }, null)!;
    expect(composed).toContain("A decision.");
    expect(composed).toContain("Another.");
  });

  it("ignores blank and non-string answers", () => {
    expect(parseIssueAnswers({ "0": "   ", "1": 7, "2": "kept" })).toEqual({ "2": "kept" });
    expect(parseIssueAnswers(null)).toEqual({});
    expect(parseIssueAnswers(["not", "an", "object"])).toEqual({});
  });
});

describe("decisionsBlock", () => {
  it("says nothing when there is nothing to say", () => {
    expect(decisionsBlock(null, "plan")).toBeNull();
    expect(decisionsBlock("   ", "plan")).toBeNull();
  });

  it("ranks the decision above the protocol, and names what it governs", () => {
    const block = decisionsBlock("The primary outcome is the conversion rate.", "form")!;
    expect(block).toContain("the decision wins");
    expect(block).toContain("the form must");
    expect(block).toContain("<investigator_decisions>");
    expect(block).toContain("The primary outcome is the conversion rate.");
    expect(block).toContain("</investigator_decisions>");
  });
});

describe("every builder uses it", () => {
  // The shell tables were built without any decisions at all until this change,
  // because the route never passed them. A grep is a blunt test, but it catches
  // exactly the regression that happened.
  it.each(["sap", "crf", "tables"])("%s/build.ts wraps the decisions the same way", async (dir) => {
    const source = await readFile(
      new URL(`../${dir}/build.ts`, import.meta.url),
      "utf8",
    );
    expect(source).toContain("decisionsBlock(options.answers");
  });
});

describe("the review's blockers reach every stage that writes", () => {
  // The plan is written in three calls and the blockers used to reach only the
  // first. The analyses are chosen in the second and the missing-data and
  // multiplicity rules in the third, which is where most of what a review
  // raises actually lands.
  it.each(["build", "map-stage", "rules-stage"])("sap/%s.ts is given them", async (file) => {
    const source = await readFile(new URL(`../sap/${file}.ts`, import.meta.url), "utf8");
    expect(source).toContain("unresolvedBlock(options.unresolved");
  });

  it("sap/build.ts is given the data as well", async () => {
    // The same blunt grep as above, catching the same regression: a block
    // written and never passed. The shell tables were built with no decisions
    // at all for months because the route never handed them over.
    const source = await readFile(new URL("../sap/build.ts", import.meta.url), "utf8");
    expect(source).toContain("dataBlock(options.data)");
  });

  it("and sap/build.ts passes them on to the other two", async () => {
    const source = await readFile(new URL("../sap/build.ts", import.meta.url), "utf8");
    expect(source.match(/unresolved: options\.unresolved/g) ?? []).toHaveLength(2);
  });
});

describe("what the plan is told about the data", () => {
  const column = (over: Partial<ColumnProfile> = {}): ColumnProfile => ({
    index: 0,
    header: "age_yrs",
    filled: 98,
    missing: 2,
    looks: "number",
    distinct: [],
    distinctTotal: 40,
    missingMarkers: [],
    ...over,
  });

  const profile = (columns: ColumnProfile[]): DatasetProfile => ({
    sheet: "Data",
    headerRow: 0,
    rowCount: 100,
    columns,
  });

  it("says nothing when no data has been attached", () => {
    expect(dataBlock(null)).toBeNull();
    expect(dataBlock(undefined)).toBeNull();
  });

  it("names each column, what it holds, and how much is missing", () => {
    const block = dataBlock(profile([column()]))!;
    expect(block).toContain("age_yrs");
    expect(block).toContain("number");
    expect(block).toContain("2");
    expect(block).toContain("100 rows");
  });

  it("lists the categories, which is what a variable is matched by", () => {
    const block = dataBlock(
      profile([
        column({
          header: "sex",
          looks: "category",
          distinct: [
            { value: "Male", count: 60 },
            { value: "Female", count: 40 },
          ],
          distinctTotal: 2,
        }),
      ]),
    )!;
    expect(block).toContain("Male");
    expect(block).toContain("Female");
  });

  it("says how many columns it left out rather than truncating quietly", () => {
    // A plan written against a sheet it was shown half of, with nothing saying
    // so, is worse than one written against no sheet at all.
    const many = Array.from({ length: 300 }, (_, i) => column({ index: i, header: `c${i}` }));
    const block = dataBlock(profile(many))!;
    expect(block).toContain("50 further columns");
    expect(block).not.toContain("c299");
  });

  it("tells the plan to declare what the protocol wants and the data lacks", () => {
    const block = dataBlock(profile([column()]))!;
    expect(block).toMatch(/declare it|does not contain/i);
  });
});
