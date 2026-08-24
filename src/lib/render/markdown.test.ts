import { describe, expect, it } from "vitest";
import { build } from "./markdown";
import { fixtureActionSpec, fixtureSpec } from "./fixture";

/**
 * These assertions lock the canonical format produced by the vendored
 * `build_review_md.js`. If one fails after editing that file, the builder
 * changed — confirm the change is intended before touching the expectation.
 */
const md = build(fixtureSpec);

describe("markdown renderer", () => {
  it("emits exactly one H1", () => {
    expect(md.split("\n").filter((l) => /^# /.test(l))).toEqual([
      "# Protocol Understanding & Review",
    ]);
  });

  it("emits all six numbered sections as H2, in order", () => {
    expect(md.split("\n").filter((l) => /^## /.test(l))).toEqual([
      "## 1. Title of the Study",
      "## 2. Type of the Study",
      "## 3. PECO (Exposure question)",
      "## 4. Objectives and Their Outcomes",
      "## 5. Sample Size — Is It Correct? Any Issues?",
      "## 6. Very Important Issues to Address (in plain words)",
    ]);
  });

  it("labels an interventional review PICO instead", () => {
    const pico = build({ ...fixtureSpec, peco: { ...fixtureSpec.peco, framework: "PICO" } });
    expect(pico).toContain("## 3. PICO (Intervention question)");
  });

  it("opens with the italic subtitle, a rule, and the bold protocol line", () => {
    expect(md.split("\n").slice(0, 7)).toEqual([
      "# Protocol Understanding & Review",
      "",
      "*Design · Objectives · Outcomes · Sample Size · Key Issues*",
      "",
      "---",
      "",
      "**Protocol reviewed: MD thesis protocol — Department of Medicine**",
    ]);
  });

  it("never emits a variables section", () => {
    expect(md.toLowerCase()).not.toContain("# variables");
  });

  it("builds tables where every row has the same number of columns", () => {
    const rows = md.split("\n").filter((l) => l.startsWith("|"));
    expect(rows.length).toBeGreaterThan(2);
    const columns = rows.map((r) => r.replace(/\\\|/g, "").split("|").length);
    expect(new Set(columns).size).toBe(1);
  });

  it("escapes a literal pipe and collapses a newline inside a cell", () => {
    const comparator = md.split("\n").find((l) => l.startsWith("| C — Comparator"));
    expect(comparator).toBeDefined();
    expect(comparator).toContain("\\|");
    expect(comparator).toContain("blinded to the index test");
    expect(comparator!.replace(/\\\|/g, "").split("|")).toHaveLength(4);
  });

  it("renders single facts as bold-label lines", () => {
    expect(md).toContain("**As written:** A prospective study");
    expect(md).toContain("**Correct classification:** Hospital-based prospective");
    expect(md).toContain("**Verdict:** Wrong formula");
    expect(md).toContain("**What the protocol did:** The protocol states n = 100");
  });

  it("renders the primary objective as a bold bullet with its outcome nested", () => {
    expect(md).toContain("### Primary objective");
    expect(md).toContain(
      "- **To determine the sensitivity and specificity of serum procalcitonin for culture-confirmed sepsis**",
    );
    expect(md).toContain("  - **Primary outcome:** Sensitivity and specificity (%)");
  });

  it("uses the canonical secondary and exploratory headings", () => {
    expect(md).toContain("### Secondary objectives and their outcomes");
    expect(md).toContain("### Exploratory objectives (extra analyses that can be done)");
    expect(md).toContain("  - **Outcome:** Area under the ROC curve");
  });

  it("leads section 6 with its standard sentence, then numbers each issue as an H3", () => {
    expect(md).toContain("The most important things to fix before the study starts:");
    expect(md).toContain("### 1. The title, the aim, and the sample size are three different studies");
    expect(md).toContain("### 2. Comorbidities are named as a category but never itemised");
  });

  it("closes with an italic footer after a rule", () => {
    expect(md.trimEnd().endsWith("fix.*")).toBe(true);
  });

  it("leaves no run of three or more newlines", () => {
    expect(md).not.toMatch(/\n{3,}/);
  });

  it("omits a section whose spec field is absent", () => {
    const minimal = build({ subtitle: "S", title: { as_written: "T", suggestions: [] } } as never);
    expect(minimal).toContain("## 1. Title of the Study");
    expect(minimal).not.toContain("## 5.");
    expect(minimal).not.toContain("## 6.");
  });
});

describe("the short action document", () => {
  const md = build(fixtureActionSpec);

  it("renders the compact variant and nothing else", () => {
    expect(md.split("\n").filter((l) => /^## /.test(l))).toEqual([
      "## Issues & Required Changes",
    ]);
    // None of the six narrative sections may appear in this document.
    expect(md).not.toContain("Title of the Study");
    expect(md).not.toContain("Objectives and Their Outcomes");
    expect(md).not.toContain("Very Important Issues");
    expect(md).not.toContain("Study snapshot");
  });

  it("uses the four canonical column headers", () => {
    expect(md).toContain("| Area | Issue in the study | Change needed | Priority |");
  });

  it("numbers the rows 1..N in order, since order is the priority", () => {
    const priorities = md
      .split("\n")
      .filter((l) => l.startsWith("|") && !l.includes("Area |") && !l.startsWith("| ---"))
      .map((l) => l.replace(/\\\|/g, "").split("|").map((c) => c.trim()).at(-2));
    expect(priorities).toEqual(["1", "2", "3"]);
  });

  it("keeps every row at four columns even when a cell contains a pipe", () => {
    const rows = md.split("\n").filter((l) => l.startsWith("|"));
    for (const row of rows) {
      expect(row.replace(/\\\|/g, "").split("|")).toHaveLength(6);
    }
    expect(md).toContain("\\|");
  });
});

describe("the two documents never merge", () => {
  it("the narrative spec carries no compact-variant fields", () => {
    // The builder renders issues_table ABOVE section 1, so a narrative spec
    // carrying one would stack the action table on top of the full review.
    expect(fixtureSpec).not.toHaveProperty("issues_table");
    expect(fixtureSpec).not.toHaveProperty("snapshot");
    expect(build(fixtureSpec)).not.toContain("Issues & Required Changes");
  });

  it("the action spec carries none of the narrative sections", () => {
    expect(fixtureActionSpec).not.toHaveProperty("title");
    expect(fixtureActionSpec).not.toHaveProperty("objectives");
    expect(fixtureActionSpec).not.toHaveProperty("key_issues");
  });
});
