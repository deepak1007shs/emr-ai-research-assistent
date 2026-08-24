import { describe, expect, it } from "vitest";
import { build } from "./markdown";
import { fixtureSpec } from "./fixture";

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
