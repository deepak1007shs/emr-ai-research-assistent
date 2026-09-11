import { describe, expect, it } from "vitest";
import { composeAnswers, parseIssueAnswers } from "./answers.ts";
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
