import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";

/**
 * Every call that writes a document gets the same output budget.
 *
 * Thinking is drawn from max_tokens along with the JSON, so a call that reasons
 * at full effort and is given half the budget is a call that will be cut off
 * once the study is large enough. It happened twice to the documents that have
 * since been removed: a stage left at 32000 crossed it when the variable
 * registry grew, and the shell tables crossed it on a plan with 78 variables.
 * One builder is left and the rule is worth keeping over it.
 *
 * The rule is not "every call is large". A follow-up call that places finished
 * fields on a form, or reads one document back against another, sets its own
 * effort to medium and its own smaller budget deliberately. The rule is that a
 * call reasoning at EFFORT is writing a document and gets DOCUMENT_MAX_TOKENS.
 */

const BUILDERS = ["protocol/analyze.ts"];

/** Each max_tokens in a source, with the request options that follow it. */
function requests(source: string): { budget: string; options: string }[] {
  const out: { budget: string; options: string }[] = [];
  const pattern = /max_tokens:\s*([A-Za-z0-9_]+)/g;
  for (const match of source.matchAll(pattern)) {
    const start = match.index ?? 0;
    out.push({ budget: match[1], options: source.slice(start, start + 600) });
  }
  return out;
}

describe("the budget a document is written under", () => {
  it.each(BUILDERS)("%s writes at the shared budget, never a number", async (file) => {
    const source = await readFile(new URL(`../${file}`, import.meta.url), "utf8");
    const writing = requests(source).filter((r) => r.options.includes("effort: EFFORT"));

    // Every builder has one. A builder with none has been renamed or reshaped,
    // and this test would otherwise pass by finding nothing to check.
    expect(writing.length).toBeGreaterThan(0);
    for (const request of writing) {
      expect(request.budget).toBe("DOCUMENT_MAX_TOKENS");
    }
  });
});
