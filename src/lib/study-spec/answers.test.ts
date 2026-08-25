import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * The answers box is only worth typing into if what is typed reaches the model.
 * These read the ingest source directly rather than mocking the SDK, because the
 * thing worth protecting is the wiring, not the call.
 */
const ingest = fs.readFileSync(
  path.join(process.cwd(), "src/lib/study-spec/ingest.ts"),
  "utf8",
);

describe("investigator answers reach the model", () => {
  it("draftStudySpec accepts them", () => {
    expect(ingest).toMatch(/answers\?: string \| null/);
  });

  it("puts them in the request content", () => {
    expect(ingest).toContain("<investigator_decisions>");
    expect(ingest).toContain("${answers}");
  });

  it("states that a decision overrides the protocol", () => {
    // Without this the model treats them as background and keeps re-raising
    // problems the investigator has already settled.
    expect(ingest).toMatch(/the decision wins/i);
    expect(ingest).toMatch(/Do not\s*\n?re-raise a problem that has been answered/i);
  });

  it("adds them to every stage, not just the first", () => {
    // They live inside ask(), which every stage calls.
    const askBody = ingest.slice(ingest.indexOf("async function ask("));
    expect(askBody.indexOf("<investigator_decisions>")).toBeGreaterThan(-1);
    expect(askBody.indexOf("<investigator_decisions>")).toBeLessThan(
      askBody.indexOf("const message = await stream.finalMessage()"),
    );
  });

  it("sends nothing when there are no answers", () => {
    expect(ingest).toMatch(/const answers = \(options\.answers \?\? ""\)\.trim\(\);/);
    expect(ingest).toMatch(/if \(answers\) \{/);
  });
});

describe("the specs route forwards them", () => {
  const route = fs.readFileSync(
    path.join(process.cwd(), "src/app/api/specs/route.ts"),
    "utf8",
  );

  it("reads the answers off the review", () => {
    expect(route).toMatch(/\.select\("answers"\)/);
  });

  it("passes them to draftStudySpec", () => {
    expect(route).toMatch(/draftStudySpec\(protocol, \{\s*\n\s*answers,/);
  });
});
