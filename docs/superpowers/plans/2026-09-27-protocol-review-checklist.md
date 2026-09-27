# Protocol Review Checklist Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run every protocol through a fixed 106-check checklist (13 Sonnet 5 calls), verify every quote in code, and write the existing Opus review from those verified findings — without changing the report's shape.

**Architecture:** A new `src/lib/checklist/` module owns the checklist, the group requests, quote verification and the shaping of the review. `model/call.ts` gains `runMessages` (many requests, one batch). `protocol/analyze.ts` takes the checklist run, adds the findings to its prompt, asks for `check_ids`, fills coverage gaps, and shapes headings, quotes, order and footer in code. `jobs/run.ts` runs the checklist before the review and stores it on the review row.

**Tech Stack:** Next.js 16, TypeScript (Node strip-only mode for lib files), Zod 4, `@anthropic-ai/sdk` 0.120, Supabase, Vitest 4, `unpdf` (new) for PDF text.

**Spec:** `docs/superpowers/specs/2026-09-27-protocol-review-checklist-design.md`

## Global Constraints

- Work in the worktree `/Users/dr.deepaksharma/Desktop/EMR AI RESEARCH ASSISTANT.worktrees/protocol-review-checklist` on branch `feat/protocol-review-checklist`. Never edit the main checkout.
- `src/lib/render/build_review_md.js` and `src/lib/render/docx.ts` are **not edited**.
- Checklist model: `claude-sonnet-5`, `thinking: { type: "adaptive" }`, `output_config.effort: "medium"`. **No `temperature`** — Sonnet 5 rejects it with a 400.
- The review model, effort and budget in `analyze.ts` stay as they are (`MODEL`, `EFFORT`, `DOCUMENT_MAX_TOKENS`).
- Checklist `VERSION = "2026-09-27"`; exactly 106 checks; 13 calls (CO and RF share one).
- Files under `src/lib/` import siblings with the `.ts` extension (`"./checks.ts"`); components import with `@/lib/...` and no extension. No TypeScript parameter properties (Node strip-only mode rejects them).
- Comments follow the repository's style: prose explaining *why*, especially what was tried and rejected.
- **A check that cannot fail is not a check** (CLAUDE.md): after each new test passes, break the implementation on purpose, confirm the test fails, then restore it.
- Commit messages: `type(scope): a plain sentence`, ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Test command: `npx vitest run <path>`; full suite `npx vitest run`; types `npx tsc --noEmit`.

---

### Task 0: Worktree dependencies and baseline

**Files:**
- Modify: `package.json`, `package-lock.json` (adds `unpdf`)

- [ ] **Step 1: Install dependencies in the worktree**

Run: `npm install`
Expected: completes; `node_modules/` exists in the worktree.

- [ ] **Step 2: Add unpdf**

Run: `npm install unpdf@^1.8.1`
Expected: `"unpdf": "^1.8.1"` appears under `dependencies` in `package.json`.

- [ ] **Step 3: Baseline**

Run: `npx vitest run && npx tsc --noEmit`
Expected: `Tests  636 passed | 1 skipped (637)`, tsc exits 0.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore(deps): unpdf, to read a PDF's text page by page for quote checks

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 1: The checklist and its knowledge tables

**Files:**
- Create: `src/lib/checklist/checks.ts`
- Create: `src/lib/checklist/tables.ts`
- Create: `src/lib/protocol/knowledge/05-checklist-tables.md`
- Test: `src/lib/checklist/checks.test.ts`

**Interfaces:**
- Produces: `VERSION`, `type Priority`, `type JudgedBy`, `GROUPS`, `type Group`, `AREA`, `CALLS: Group[][]`, `type ChecklistItem`, `CHECKLIST`, `CHECK_BY_ID: Map<string, ChecklistItem>`, `RANK: Record<Priority, number>`, `checksToAnswer(groups: Group[]): ChecklistItem[]`, `parseTables(md: string): Map<string, string>`, `tablesFor(groups: Group[]): string`.

- [ ] **Step 1: Write the failing test**

`src/lib/checklist/checks.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  CALLS,
  CHECKLIST,
  CHECK_BY_ID,
  GROUPS,
  VERSION,
  checksToAnswer,
} from "./checks.ts";
import { parseTables, tablesFor } from "./tables.ts";

/**
 * The checklist is the spec's Section 5, and nothing else. These tests hold the
 * count, the IDs and the fixed priorities to it, so a check cannot be dropped,
 * renamed or quietly downgraded without a test saying so.
 */

describe("the checklist", () => {
  it("has the spec's 106 checks, each ID once", () => {
    expect(CHECKLIST).toHaveLength(106);
    expect(new Set(CHECKLIST.map((c) => c.id)).size).toBe(106);
    expect(VERSION).toBe("2026-09-27");
  });

  it("has the spec's count in every group", () => {
    const count = (g: string) => CHECKLIST.filter((c) => c.group === g).length;
    expect(Object.fromEntries(GROUPS.map((g) => [g, count(g)]))).toEqual({
      DOC: 5, TI: 6, DE: 6, OB: 13, SS: 12, CRF: 10, EL: 8,
      IN: 7, TF: 8, RB: 7, AN: 10, ET: 8, CO: 4, RF: 2,
    });
  });

  it("marks exactly the spec's seventeen checks Critical", () => {
    const critical = CHECKLIST.filter((c) => c.priority === "Critical").map((c) => c.id);
    expect(critical).toEqual([
      "DOC1", "OB1", "OB3", "OB8", "SS1", "SS2", "SS3", "SS4", "SS8",
      "CRF1", "CRF8", "EL2", "TF1", "AN1", "ET1", "ET2", "ET4",
    ]);
  });

  it("gives every check a group, an area and wording", () => {
    for (const c of CHECKLIST) {
      expect(GROUPS).toContain(c.group);
      expect(c.area.length, c.id).toBeGreaterThan(0);
      expect(c.fails_when.length, c.id).toBeGreaterThan(5);
    }
  });

  it("answers DOC5 in code, and marks the spec's code checks provisional", () => {
    expect(CHECK_BY_ID.get("DOC5")?.judged_by).toBe("code");
    expect(CHECK_BY_ID.get("SS3")?.judged_by).toBe("model-provisional");
    expect(CHECK_BY_ID.get("SS1")?.judged_by).toBe("model");
  });

  it("puts every group in exactly one of thirteen calls", () => {
    expect(CALLS).toHaveLength(13);
    expect(CALLS.flat().slice().sort()).toEqual([...GROUPS].sort());
  });

  it("never sends a code-answered check to the model", () => {
    const doc = checksToAnswer(["DOC"]).map((c) => c.id);
    expect(doc).toEqual(["DOC1", "DOC2", "DOC3", "DOC4"]);
    expect(checksToAnswer(["CO", "RF"])).toHaveLength(6);
  });
});

describe("the knowledge tables", () => {
  it("parses a file into its A-numbered sections", () => {
    const md = "# Title\n\n## A1 Tree\none\n\n## A2 Map\ntwo\n";
    const got = parseTables(md);
    expect([...got.keys()]).toEqual(["A1", "A2"]);
    expect(got.get("A2")).toBe("## A2 Map\ntwo");
  });

  it("gives each group only the tables it needs", () => {
    const de = tablesFor(["DE"]);
    expect(de).toContain("## A1");
    expect(de).toContain("## A2");
    expect(de).not.toContain("## A3");
    expect(tablesFor(["SS"])).toContain("## A3");
    expect(tablesFor(["RB"])).toContain("## A4");
    expect(tablesFor(["AN"])).toContain("## A5");
    expect(tablesFor(["TI"])).toBe("");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/checklist/checks.test.ts`
Expected: FAIL — cannot resolve `./checks.ts`.

- [ ] **Step 3: Write `src/lib/checklist/checks.ts`**

```ts
/**
 * The master checklist every protocol is judged against.
 *
 * The review used to be one model call that decided every finding, and the
 * same protocol reviewed four times gave four different issue lists. The
 * checklist is the fix the Protocol Analyzer spec (Section 5) prescribes: a
 * fixed list, answered in full on every protocol, with the priority set here
 * and never by the model. What varies between runs is then only the answer to
 * a narrow question, not which questions were asked.
 *
 * `judged_by` records who answers. The spec gives some checks to code - a
 * recalculated sample size, a value compared across sections, a document
 * inventory. Until that code exists the model answers them, and they are
 * marked `model-provisional` so nobody mistakes the answer for a computed one.
 * DOC5 is answered in code already: the app accepts one file.
 *
 * Adding, removing or rewording a check is a deliberate act. Bump VERSION when
 * you do, so a review can say which list it was checked against.
 */
export const VERSION = "2026-09-27";

export type Priority = "Critical" | "Major" | "Minor";
export type JudgedBy = "model" | "model-provisional" | "code";

export const GROUPS = [
  "DOC", "TI", "DE", "OB", "SS", "CRF", "EL", "IN", "TF", "RB", "AN", "ET", "CO", "RF",
] as const;
export type Group = (typeof GROUPS)[number];

export const AREA: Record<Group, string> = {
  DOC: "Documents",
  TI: "Title",
  DE: "Design",
  OB: "Objectives & outcomes",
  SS: "Sample size",
  CRF: "Data form",
  EL: "Eligibility & controls",
  IN: "Instruments",
  TF: "Time points & feasibility",
  RB: "Randomisation & bias",
  AN: "Analysis plan",
  ET: "Ethics",
  CO: "Consistency",
  RF: "References",
};

/**
 * One model call per entry. A call answers a bounded group, which is what the
 * spec asks for and what keeps a long answer from drifting. CO and RF share a
 * call because they hold six checks between them.
 */
export const CALLS: Group[][] = [
  ["DOC"], ["TI"], ["DE"], ["OB"], ["SS"], ["CRF"], ["EL"],
  ["IN"], ["TF"], ["RB"], ["AN"], ["ET"], ["CO", "RF"],
];

export type ChecklistItem = {
  id: string;
  group: Group;
  area: string;
  /** The spec's "Check (FAIL when…)" wording. */
  fails_when: string;
  /** Fixed here. The model never chooses a priority. */
  priority: Priority;
  judged_by: JudgedBy;
};

const P = { C: "Critical", M: "Major", m: "Minor" } as const;
const J = { m: "model", p: "model-provisional", c: "code" } as const;

function check(
  id: string,
  fails_when: string,
  priority: keyof typeof P,
  judged: keyof typeof J,
): ChecklistItem {
  const group = id.replace(/\d+$/, "") as Group;
  return { id, group, area: AREA[group], fails_when, priority: P[priority], judged_by: J[judged] };
}

export const CHECKLIST: ChecklistItem[] = [
  check("DOC1", "Protocol text incomplete or truncated", "C", "p"),
  check("DOC2", "CRF / proforma not provided", "M", "p"),
  check("DOC3", "PIS / consent / assent not provided", "M", "p"),
  check("DOC4", "Scale named but its annexure missing", "M", "p"),
  check("DOC5", "More than one version uploaded, final not confirmed", "m", "c"),

  check("TI1", "Design not named or named wrongly in title", "m", "m"),
  check("TI2", "Over-claiming word (efficacy / impact / effect) without a control group", "M", "p"),
  check("TI3", "Cause words (predictors / risk factors) in a one-time-point design", "M", "p"),
  check("TI4", "A promise in the title (profile, trajectory…) has no objective or analysis", "M", "m"),
  check("TI5", "Population / intervention words differ from inclusion or objectives", "m", "p"),
  check("TI6", "Spelling, informal terms (\"randomised control trial\"), abbreviations not expanded", "m", "m"),

  check("DE1", "Stated design differs from design found by the decision tree", "M", "p"),
  check("DE2", "Timing word used as the design (prospective / ambispective / observational alone)", "M", "m"),
  check("DE3", "Special aim (diagnostic, prediction, agreement) labelled as ordinary design", "M", "p"),
  check("DE4", "Two designs mixed without per-objective labels", "M", "m"),
  check("DE5", "Reporting guideline absent or wrong for the design", "m", "p"),
  check("DE6", "Wrong frame (PICO for observational / PECO for trial) or comparator undefined", "m", "p"),

  check("OB1", "No primary objective, or more than one without multiplicity plan", "C", "p"),
  check("OB2", "Primary objective bundles several outcomes", "M", "m"),
  check("OB3", "Primary outcome differs between aim, objectives, methods, sample size, analysis", "C", "p"),
  check("OB4", "Outcome missing what / how / tool / time / unit / type", "M", "m"),
  check("OB5", "Cut-off or international definition not stated, or two different cut-offs", "M", "p"),
  check("OB6", "Promise in aim / introduction / consent not an objective", "M", "m"),
  check("OB7", "Predictor written as an outcome (or reverse)", "m", "m"),
  check("OB8", "Objective unanswerable with the planned design or data", "C", "m"),
  check("OB9", "Composite outcome not declared", "m", "m"),
  check("OB10", "Hypothesis absent, wrong direction, or back-to-front", "M", "m"),
  check("OB11", "Continuous outcome cut into groups without reason", "m", "m"),
  check("OB12", "Too many secondary objectives for the sample size", "m", "p"),
  check("OB13", "Definition depends on the study's own data (e.g. cohort median)", "M", "m"),

  check("SS1", "No calculation (\"time-bound\" / convenience without justification)", "C", "m"),
  check("SS2", "Formula family wrong for design + primary outcome", "C", "p"),
  check("SS3", "Recalculated n differs >5% from stated n", "C", "p"),
  check("SS4", "Powered on an outcome that is not the primary", "C", "p"),
  check("SS5", "Inputs have no source, or source does not report the value / unit / population", "M", "p"),
  check("SS6", "Unit or z-value error", "M", "p"),
  check("SS7", "Events per variable < 10 for a planned regression", "M", "p"),
  check("SS8", "Non-inferiority margin absent or unjustified", "C", "m"),
  check("SS9", "Cluster design without design effect; repeated measures / 3+ groups with 2-group formula", "M", "p"),
  check("SS10", "Calculated n abandoned for a smaller convenience number", "M", "m"),
  check("SS11", "No dropout allowance", "m", "p"),
  check("SS12", "Pilot study presented as confirmatory", "M", "m"),

  check("CRF1", "Primary outcome or exposure has no field", "C", "p"),
  check("CRF2", "Secondary outcome has no field", "M", "p"),
  check("CRF3", "Control group not given the same fields", "M", "m"),
  check("CRF4", "Free-text / multi-value field where analysis needs categories", "M", "m"),
  check("CRF5", "Summary or score recorded without its raw inputs", "M", "m"),
  check("CRF6", "No date for each visit; no admission / discharge dates for duration outcomes", "M", "m"),
  check("CRF7", "Known confounders not collected (suggested list, needs agreement)", "M", "m"),
  check("CRF8", "Group / allocation field missing in a comparative study", "C", "p"),
  check("CRF9", "Fields that serve no objective", "m", "p"),
  check("CRF10", "Identifiers (name, phone) used as study ID", "M", "p"),

  check("EL1", "Gap or overlap between inclusion and exclusion", "M", "m"),
  check("EL2", "Control group not defined (source, criteria, matching)", "C", "m"),
  check("EL3", "Controls related to cases, not healthy, or not matched as promised", "M", "m"),
  check("EL4", "Exclusion on something that is also an outcome", "M", "m"),
  check("EL5", "Exclusion of patients unable to consent in a severity / mortality study", "M", "m"),
  check("EL6", "Post-randomisation exclusions", "M", "m"),
  check("EL7", "Criteria not measurable, or exclusion criteria absent", "m", "m"),
  check("EL8", "Exclusion that causes spectrum bias in a diagnostic study", "M", "m"),

  check("IN1", "Scale annexure: item count, range or scoring does not match its source", "M", "p"),
  check("IN2", "Reverse-scored items or cut-offs not stated", "M", "p"),
  check("IN3", "Adult / wrong-age / wrong-language version", "M", "p"),
  check("IN4", "Licensed scale without permission mentioned", "m", "p"),
  check("IN5", "Measure does not fit the modality (CT units in MRI)", "M", "m"),
  check("IN6", "Tool only partly used (criteria missing) without saying so", "M", "p"),
  check("IN7", "Several different tools named for one outcome", "M", "p"),

  check("TF1", "Follow-up longer than the study period", "C", "p"),
  check("TF2", "Follow-up shorter than the outcome needs", "M", "m"),
  check("TF3", "Measurement timing undefined (e.g. \"before or after treatment\")", "M", "m"),
  check("TF4", "No visit windows / no maximum interval between tests", "m", "m"),
  check("TF5", "Required tests not available locally (asks user to confirm)", "M", "p"),
  check("TF6", "No yearly patient numbers behind the sample size", "m", "m"),
  check("TF7", "Fixed order of conditions confounded with time", "M", "m"),
  check("TF8", "Retrospective arm cannot supply variables / scales", "M", "m"),

  check("RB1", "Randomisation sequence method not stated", "M", "m"),
  check("RB2", "Allocation concealment not stated, or two methods offered as alternatives", "M", "m"),
  check("RB3", "Blinding unclear or contradictory (\"open-label single-blind\")", "M", "m"),
  check("RB4", "Readers of index / reference tests not blinded (diagnostic)", "M", "m"),
  check("RB5", "Reference standard not applied to all (verification bias)", "M", "m"),
  check("RB6", "Test component also inside the reference definition (incorporation bias)", "M", "m"),
  check("RB7", "Design-specific checklist item missing (Appendix A4)", "M", "m"),

  check("AN1", "No analysis section or one line only", "C", "p"),
  check("AN2", "Test does not fit outcome type / groups / pairing", "M", "p"),
  check("AN3", "3+ visits not analysed with repeated-measures / mixed model", "M", "p"),
  check("AN4", "Unit of analysis (eye / side / session) not stated", "M", "m"),
  check("AN5", "OR for a common outcome in cohort / cross-sectional / RCT", "M", "p"),
  check("AN6", "No adjustment plan for confounders", "M", "m"),
  check("AN7", "No missing-data, ITT or multiplicity plan", "M", "m"),
  check("AN8", "Unplanned or unadjusted interim analysis", "M", "m"),
  check("AN9", "Wrong test for comparing AUCs (use DeLong) / no calibration for prediction", "M", "m"),
  check("AN10", "Software / significance level not stated", "m", "m"),

  check("ET1", "Ethics text describes a different design", "C", "p"),
  check("ET2", "Children enrolled without parent consent + child assent", "C", "m"),
  check("ET3", "No LAR route for patients unable to consent", "M", "m"),
  check("ET4", "Trial not planned for CTRI registration before first patient", "C", "m"),
  check("ET5", "PIS / consent content differs from protocol (tests, visits, numbers)", "M", "p"),
  check("ET6", "Consent form claims approval already granted", "M", "m"),
  check("ET7", "No confidentiality / coded-ID statement", "m", "m"),
  check("ET8", "No adverse-event reporting or stopping rule for an intervention", "M", "m"),

  check("CO1", "Sample size differs between documents / sections", "M", "p"),
  check("CO2", "Duration or dates differ", "m", "p"),
  check("CO3", "Measurement site / method differs between methods, CRF and analysis", "M", "p"),
  check("CO4", "Leftover template text (e.g. placebo arm in two-arm trial)", "m", "m"),
  check("RF1", "Citation cannot be found (Crossref / PubMed lookup)", "M", "p"),
  check("RF2", "Number credited to a paper that does not report it", "M", "p"),
];

export const CHECK_BY_ID = new Map(CHECKLIST.map((c) => [c.id, c]));

/** Critical first. Used wherever issues are ordered. */
export const RANK: Record<Priority, number> = { Critical: 0, Major: 1, Minor: 2 };

/** The checks a call for these groups sends to the model: every one not answered in code. */
export function checksToAnswer(groups: Group[]): ChecklistItem[] {
  return CHECKLIST.filter((c) => groups.includes(c.group) && c.judged_by !== "code");
}
```

- [ ] **Step 4: Write `src/lib/protocol/knowledge/05-checklist-tables.md`**

```markdown
# Checklist reference tables

These are the Protocol Analyzer spec's Appendix A1–A5. Each checklist call is
given only the tables its checks need; the review call does not load this file.

## A1 Design decision tree

Answer the questions in order. Timing words (prospective, retrospective,
longitudinal, observational) are NEVER a design by themselves.

- Q0a New data collected? No → evidence synthesis (systematic review / meta-analysis / scoping).
- Q0b Words or numbers? Words → qualitative (phenomenology, grounded theory, thematic). Both → mixed methods (convergent, explanatory, exploratory, embedded).
- Q0c Special aim? Test accuracy → diagnostic accuracy (STARD). Risk score / predictors → prediction model (TRIPOD). Agreement → reliability / agreement (GRRAS). Cost → economic evaluation (CHEERS). The special aim wins even if the data look cross-sectional.
- Q1 Did the investigator assign an intervention?
  - Yes → Q2 Random allocation?
    - Yes → RCT (parallel, cross-over, factorial, cluster, stepped-wedge; superiority / non-inferiority / equivalence; pilot).
    - No → non-randomised (single-arm before-after, controlled before-after, historical control, time series, quasi-experimental, QI).
  - No → Q3 Comparison group?
    - No → case report / case series / prevalence survey / descriptive cohort.
    - Yes → Q4 Direction?
      - Exposure → outcome = cohort (prospective / retrospective / ambispective).
      - Outcome → past exposure = case-control.
      - Same time = analytical cross-sectional.
- Mixed designs: classify each objective separately.

## A2 Reporting guideline map

| Design | Guideline |
|---|---|
| RCT | CONSORT (protocol: SPIRIT; extensions for cluster, non-inferiority, non-drug) |
| Non-randomised interventional | TREND |
| Cohort / case-control / cross-sectional | STROBE |
| Diagnostic accuracy | STARD |
| Prediction model | TRIPOD |
| Reliability / agreement | GRRAS |
| Qualitative | COREQ / SRQR |
| Mixed methods | GRAMMS |
| Systematic review | PRISMA / PRISMA-P / PROSPERO |
| Economic | CHEERS |
| Case report | CARE |
| Quality improvement | SQUIRE |

Frame: PICO for a design where the investigator assigns the intervention; PECO for an observational design.

## A3 Sample-size formula lookup

| Design × primary outcome | Formula family | Required inputs |
|---|---|---|
| Estimate one proportion | Z²p(1−p)/d² | p, precision d |
| Estimate one mean | Z²σ²/d² | SD, precision d |
| Compare 2 proportions | Two-proportion power | p1, p2, α, power, ratio |
| Compare 2 means | Two-mean power | SD, difference, α, power, ratio |
| Before–after / paired | Paired means | SD of change, difference, α, power |
| 3+ groups | ANOVA power | effect size f, groups, α, power |
| Repeated measures | RM / ANCOVA formula | SD, correlation between visits, visits |
| Case-control | Two-proportion (exposure) | exposure in cases / controls, α, power |
| Matched case-control | McNemar / matched pairs | discordant proportion |
| Time-to-event | Event-driven / log-rank | HR, event rate, α, power |
| Non-inferiority / equivalence | NI / equivalence formula | margin (justified), rates, one-sided α, power |
| Diagnostic accuracy | Buderer | expected Se / Sp, precision, prevalence |
| Agreement | Kappa / ICC formula | expected and minimum kappa / ICC |
| Correlation | Fisher z | expected r, α, power |
| Regression / prediction | ≥10 events per variable or 100 + 50 × predictors | predictors, event rate |
| Cluster | individual n × design effect | ICC, cluster size |
| Pilot | rule of thumb / precision of feasibility rates | stated as feasibility |

Common z-values: two-sided α = 0.05 → 1.96; power 80% → 0.84; power 90% → 1.28.
A recalculated n more than 5% away from the stated n does not reproduce.

## A4 Design-specific checklists

| Design | Must be stated |
|---|---|
| RCT | sequence generation; concealment; ratio, blocks, strata; who is blinded; superiority / NI (+ margin); ITT; CONSORT flow; CTRI before first patient |
| Non-randomised | why not randomised; control choice; confounding plan; regression to the mean; co-treatments |
| Cohort | exposure definition; time zero; outcome-free at start; loss to follow-up; immortal time |
| Case-control | case definition (new vs existing); control source; matching; same exposure measurement |
| Cross-sectional | sampling frame; association wording only; prevalence ratio |
| Diagnostic accuracy | index and reference test; reference for all; readers blinded; cut-off fixed; test interval; spectrum; indeterminate results; unit of analysis |
| Prediction model | predictors pre-listed; EPV; no dichotomising; internal validation; discrimination + calibration |
| Reliability | raters; independence; training; right statistic (kappa type / ICC type / Bland–Altman) |
| Qualitative | purposive sampling; saturation; interview guide; coding; reflexivity |
| Systematic review | PROSPERO; databases + full search; two reviewers; risk-of-bias tool; heterogeneity plan |

## A5 Test lookup

| Outcome | 2 independent | Paired | 3+ groups | 3+ time points |
|---|---|---|---|---|
| Continuous normal | t-test (Welch) | paired t | ANOVA | RM-ANOVA / mixed model |
| Continuous skewed / ordinal | Mann–Whitney | Wilcoxon | Kruskal–Wallis | Friedman / mixed model |
| Binary / categorical | Chi-square / Fisher | McNemar | Chi-square | Cochran Q / GEE |
| Time-to-event | KM + log-rank; Cox | — | log-rank | Cox |
| Count | Poisson / NB | — | — | GEE / mixed Poisson |

Effect measure rule: RCT / cohort / cross-sectional with a common outcome → RR
or PR (log-binomial, modified Poisson fallback); OR only for case-control or an
outcome under 10%; always a 95% CI and the absolute difference.
Diagnostic: sensitivity, specificity, PPV, NPV, AUC with CI; DeLong to compare
AUCs. Prediction: discrimination, calibration, validation.
```

- [ ] **Step 5: Write `src/lib/checklist/tables.ts`**

```ts
import fs from "node:fs";
import path from "node:path";
import type { Group } from "./checks.ts";

/**
 * The spec's Appendix A tables, handed to the checklist calls that need them.
 *
 * One file, split by its `## A1`…`## A5` headings, so the tables stay prose a
 * methodologist can edit and diff. A call is given only its own tables: the
 * sample-size call has no use for the test lookup, and every table a call does
 * not need is text it could quote from instead of the protocol.
 *
 * `next.config.ts` already traces `src/lib/protocol/knowledge/**` into the
 * server bundle, which is why the file lives there.
 */

const FILE = path.join(process.cwd(), "src", "lib", "protocol", "knowledge", "05-checklist-tables.md");

const NEEDS: Partial<Record<Group, string[]>> = {
  DE: ["A1", "A2"],
  SS: ["A3"],
  RB: ["A4"],
  AN: ["A5"],
};

export function parseTables(md: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const part of md.split(/^(?=## A\d\b)/m)) {
    const match = /^## (A\d)\b/.exec(part);
    if (match) out.set(match[1], part.trim());
  }
  return out;
}

let sections: Map<string, string> | null = null;

export function tablesFor(groups: Group[]): string {
  sections ??= parseTables(fs.readFileSync(FILE, "utf8"));
  const wanted = [...new Set(groups.flatMap((g) => NEEDS[g] ?? []))];
  return wanted
    .map((id) => {
      const section = sections!.get(id);
      if (!section) throw new Error(`Knowledge table ${id} is missing from 05-checklist-tables.md.`);
      return section;
    })
    .join("\n\n");
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run src/lib/checklist/checks.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 7: Prove the tests can fail**

Change `check("SS3", …, "C", "p")` to `"M"`; run the test; expect the Critical-list test to FAIL. Restore it. Delete the `## A4` heading from the markdown; expect `tablesFor(["RB"])` to FAIL. Restore it.

- [ ] **Step 8: Commit**

```bash
git add src/lib/checklist/checks.ts src/lib/checklist/tables.ts src/lib/checklist/checks.test.ts src/lib/protocol/knowledge/05-checklist-tables.md
git commit -m "feat(checklist): the spec's 106 checks, with fixed priorities and their reference tables

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: The result schema and the group request

**Files:**
- Create: `src/lib/checklist/schema.ts`
- Create: `src/lib/checklist/request.ts`
- Test: `src/lib/checklist/request.test.ts`

**Interfaces:**
- Consumes: `CHECKLIST`, `checksToAnswer`, `type Group`, `type Priority`, `type JudgedBy` (Task 1); `type ExtractedProtocol` from `src/lib/protocol/extract.ts`.
- Produces: `RESULTS`, `type Result`, `modelCheckSchema`, `type ModelCheck`, `groupAnswerSchema`, `GROUP_ANSWER_JSON_SCHEMA`, `type CheckResult`; `CHECKLIST_MODEL`, `CHECKLIST_EFFORT`, `CHECKLIST_MAX_TOKENS`, `RULES`, `groupRequest(protocol: ExtractedProtocol, groups: Group[], tables: string): Anthropic.Messages.MessageCreateParamsNonStreaming`.

- [ ] **Step 1: Write the failing test**

`src/lib/checklist/request.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { groupRequest, CHECKLIST_MODEL } from "./request.ts";
import { GROUP_ANSWER_JSON_SCHEMA, groupAnswerSchema } from "./schema.ts";
import type { ExtractedProtocol } from "../protocol/extract.ts";

const text: ExtractedProtocol = {
  kind: "text",
  text: "Title: A study\nSample size: 40 patients.",
  filename: "p.docx",
  bytes: 40,
};
const pdf: ExtractedProtocol = { kind: "pdf", base64: "JVBERi0=", filename: "p.pdf", bytes: 5 };

type Block = { type: string; text?: string; cache_control?: unknown };
const blocks = (groups: Parameters<typeof groupRequest>[1], tables = "", p = text) =>
  groupRequest(p, groups, tables).messages[0].content as Block[];

describe("a checklist group request", () => {
  it("runs on Sonnet 5 at medium effort, with no temperature", () => {
    const req = groupRequest(text, ["SS"], "");
    expect(req.model).toBe(CHECKLIST_MODEL);
    expect(CHECKLIST_MODEL).toBe("claude-sonnet-5");
    expect(req).not.toHaveProperty("temperature");
    expect(req.output_config).toMatchObject({ effort: "medium" });
  });

  it("puts the protocol first and marks it for caching", () => {
    const [first] = blocks(["SS"], "", pdf);
    expect(first.type).toBe("document");
    expect(first.cache_control).toEqual({ type: "ephemeral" });
    const [firstText] = blocks(["SS"]);
    expect(firstText.text).toContain("Sample size: 40 patients.");
    expect(firstText.cache_control).toEqual({ type: "ephemeral" });
  });

  it("lists exactly the group's model-answered checks", () => {
    const ask = blocks(["DOC"]).at(-1)!.text!;
    for (const id of ["DOC1", "DOC2", "DOC3", "DOC4"]) expect(ask).toContain(`- ${id} `);
    expect(ask).not.toContain("DOC5");
    expect(ask).toContain("Answer these 4 checks");
  });

  it("includes the reference tables only when given", () => {
    expect(blocks(["DE"], "## A1 Tree").at(-1)!.text).toContain("## A1 Tree");
    expect(blocks(["TI"]).at(-1)!.text).not.toContain("Reference tables");
  });
});

describe("the group answer schema", () => {
  it("is strict all the way down", () => {
    const walk = (node: unknown): void => {
      if (!node || typeof node !== "object") return;
      const n = node as Record<string, unknown>;
      if (n.type === "object") {
        expect(n.additionalProperties).toBe(false);
        expect(Object.keys(n.properties as object).sort()).toEqual((n.required as string[]).slice().sort());
        Object.values(n.properties as object).forEach(walk);
      }
      if (n.type === "array") walk(n.items);
    };
    walk(GROUP_ANSWER_JSON_SCHEMA);
  });

  it("rejects a result outside the four", () => {
    const bad = { checks: [{ check_id: "SS1", target: "", result: "MAYBE", quote: "", note: "" }] };
    expect(groupAnswerSchema.safeParse(bad).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/checklist/request.test.ts`
Expected: FAIL — cannot resolve `./request.ts`.

- [ ] **Step 3: Write `src/lib/checklist/schema.ts`**

```ts
import { z } from "zod";
import type { JudgedBy, Priority } from "./checks.ts";

/**
 * What a checklist call returns, and what code makes of it.
 *
 * The model answers four fields per check. Everything a reader relies on -
 * the priority, where the quote is, whether it was found at all - is added by
 * code afterwards, so none of it can drift between runs.
 */

export const RESULTS = ["PASS", "FAIL", "NOT_APPLICABLE", "NOT_STATED"] as const;
export type Result = (typeof RESULTS)[number];

export const modelCheckSchema = z.object({
  check_id: z.string().min(1),
  target: z.string(),
  result: z.enum(RESULTS),
  quote: z.string(),
  note: z.string(),
});
export type ModelCheck = z.infer<typeof modelCheckSchema>;

export const groupAnswerSchema = z.object({ checks: z.array(modelCheckSchema) });

const str = { type: "string" } as const;

/** Hand-written for strict structured output: every key required, nothing extra. */
export const GROUP_ANSWER_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["checks"],
  properties: {
    checks: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["check_id", "target", "result", "quote", "note"],
        properties: {
          check_id: { ...str, description: "The check's ID exactly as given, e.g. 'OB4'." },
          target: {
            ...str,
            description:
              "The objective or outcome this result is about ('P1', 'S2', 'pain at 24 hours'), or '' when the check is about the protocol as a whole.",
          },
          result: { type: "string", enum: [...RESULTS] },
          quote: {
            ...str,
            description:
              "One or two sentences copied from the protocol word for word, spelling mistakes included. '' only when no sentence bears on the check.",
          },
          note: { ...str, description: "One or two plain sentences: what is wrong, or why it passes. Show any numbers used." },
        },
      },
    },
  },
} as const;

/** A check result after code has verified it. This is what is stored. */
export type CheckResult = ModelCheck & {
  area: string;
  priority: Priority;
  judged_by: JudgedBy;
  /** "p. 14", "Section: Methodology", or null when there is no quote or it was not found. */
  location: string | null;
  quote_verified: boolean;
  /**
   * True when the result cannot be trusted: its quote was not found in the
   * protocol, or the check was never answered. Such a result is shown in the
   * checklist panel and never raised as an issue.
   */
  needs_review: boolean;
};
```

- [ ] **Step 4: Write `src/lib/checklist/request.ts`**

```ts
import type Anthropic from "@anthropic-ai/sdk";
import type { ExtractedProtocol } from "../protocol/extract.ts";
import { checksToAnswer, type Group } from "./checks.ts";
import { GROUP_ANSWER_JSON_SCHEMA } from "./schema.ts";

/**
 * One checklist call.
 *
 * Sonnet 5 at medium effort, because each call answers a narrow, bounded
 * question and a stronger model does not make the answers repeat more
 * reliably. The spec asks for temperature 0; Sonnet 5 rejects any temperature
 * with a 400, so repeatability comes from the fixed list, the small groups and
 * the strict schema instead.
 *
 * The protocol goes first and is marked for caching, so the thirteen calls
 * share one cached prefix; the group's own checks and tables come after it.
 */

export const CHECKLIST_MODEL = process.env.CHECKLIST_MODEL ?? "claude-sonnet-5";
export const CHECKLIST_EFFORT = "medium" as const;
/** Thinking is drawn from this too. Thirteen checks with notes fit well inside it. */
export const CHECKLIST_MAX_TOKENS = 32_000;

export const RULES = `You are checking a postgraduate medical research protocol against a fixed checklist.
You do not write a review. You answer the checks you are given, one result per check, and nothing else.

For every check:
- FAIL means the problem the check describes is present in this protocol.
- PASS means the protocol handles it.
- NOT_APPLICABLE means the check does not apply to this protocol's design, for example a randomisation check in a cross-sectional study. Decide this from the protocol itself.
- NOT_STATED means the protocol says too little to judge the check either way.

Quotes:
- Copy the quote from the protocol word for word, including its spelling mistakes. Code searches the protocol for it; a quote that is not found is discarded, and the result with it.
- Quote the sentence that shows the problem. When the problem is that something is missing, quote the nearest sentence where it should have been, or leave the quote empty.
- Never paraphrase, summarise or join two passages into one quote.

Never invent a number, a citation or a fact the protocol does not contain.
Some checks describe work that will later be done by code, such as recalculating a sample size or comparing a value across sections. Do it as carefully as you can by reading, and show the numbers in the note.
A check may be answered more than once when it applies to several objectives or outcomes: give each its own entry with its own target.`;

function protocolBlock(protocol: ExtractedProtocol): Anthropic.ContentBlockParam {
  if (protocol.kind === "pdf") {
    return {
      type: "document",
      source: { type: "base64", media_type: "application/pdf", data: protocol.base64 },
      cache_control: { type: "ephemeral" },
    };
  }
  return {
    type: "text",
    text: `<protocol filename="${protocol.filename}">\n${protocol.text}\n</protocol>`,
    cache_control: { type: "ephemeral" },
  };
}

export function groupRequest(
  protocol: ExtractedProtocol,
  groups: Group[],
  tables: string,
): Anthropic.Messages.MessageCreateParamsNonStreaming {
  const checks = checksToAnswer(groups);
  const list = checks.map((c) => `- ${c.id} (${c.area}) — FAIL when: ${c.fails_when}`).join("\n");
  const ask = [
    tables ? `Reference tables for these checks:\n\n${tables}` : "",
    `Answer these ${checks.length} checks for the protocol above. Return every one of them.\n\n${list}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  return {
    model: CHECKLIST_MODEL,
    max_tokens: CHECKLIST_MAX_TOKENS,
    thinking: { type: "adaptive" },
    output_config: {
      effort: CHECKLIST_EFFORT,
      format: { type: "json_schema", schema: GROUP_ANSWER_JSON_SCHEMA },
    },
    system: [{ type: "text", text: RULES }],
    messages: [{ role: "user", content: [protocolBlock(protocol), { type: "text", text: ask }] }],
  };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/lib/checklist/request.test.ts && npx tsc --noEmit`
Expected: PASS (6 tests); tsc exits 0. If tsc rejects `output_config` or `cache_control` on the document block, compare with the identical shapes already in `src/lib/protocol/analyze.ts` and `src/lib/facts/extract.ts` and match them.

- [ ] **Step 6: Prove the tests can fail**

Drop the `judged_by !== "code"` filter in `checksToAnswer`; the DOC test must FAIL. Restore.

- [ ] **Step 7: Commit**

```bash
git add src/lib/checklist/schema.ts src/lib/checklist/request.ts src/lib/checklist/request.test.ts
git commit -m "feat(checklist): one bounded Sonnet 5 call per check group, sharing a cached protocol

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Many requests in one batch (`runMessages`)

**Files:**
- Modify: `src/lib/model/call.ts` (extract batch polling into `awaitBatch`; add `runMessages`)
- Test: `src/lib/model/call.test.ts` (append)

**Interfaces:**
- Produces: `type NamedRequest = { id: string; params: Anthropic.Messages.MessageCreateParamsNonStreaming }`, `type NamedResult = { id: string; message: Anthropic.Message | null; error: string | null }`, `runMessages(client, requests: NamedRequest[], options?: CallOptions, now?: () => number): Promise<{ results: NamedResult[]; usage: TokenUsage }>`.

- [ ] **Step 1: Write the failing tests** (append to `src/lib/model/call.test.ts`; add `runMessages` to the import list at the top of the file)

```ts
describe("many requests at once", () => {
  const named = (id: string) => ({ id, params: { ...params, messages: [{ role: "user" as const, content: id }] } });
  const reply = (id: string) =>
    ({ ...message, id, content: [{ type: "text", text: id }] }) as unknown as Anthropic.Message;

  it("sends them as one batch and returns results in request order, whatever order they arrive", async () => {
    vi.useFakeTimers();
    const batches = {
      create: vi.fn(async (_body: { requests: { custom_id: string }[] }) => ({ id: "batch_m", processing_status: "in_progress" })),
      retrieve: vi.fn(async () => ({ id: "batch_m", processing_status: "ended", request_counts: { succeeded: 2 } })),
      cancel: vi.fn(),
      results: vi.fn(async () =>
        (async function* () {
          yield { custom_id: "b", result: { type: "errored", error: { error: { message: "overloaded" } } } };
          yield { custom_id: "a", result: { type: "succeeded", message: reply("a") } };
        })(),
      ),
    };
    const client = { messages: { batches } } as unknown as Anthropic;
    const onBatch = vi.fn();
    const got = await drive(runMessages(client, [named("a"), named("b")], { mode: "batch", onBatch }));
    vi.useRealTimers();

    expect(batches.create).toHaveBeenCalledTimes(1);
    expect(batches.create.mock.calls[0][0].requests.map((r) => r.custom_id)).toEqual(["a", "b"]);
    expect(onBatch).toHaveBeenCalledWith("batch_m");
    expect(got.results.map((r) => r.id)).toEqual(["a", "b"]);
    expect(got.results[0].message?.id).toBe("a");
    expect(got.results[1]).toEqual({ id: "b", message: null, error: "overloaded" });
    // Only the answered request is billed, and at the batch price.
    expect(got.usage).toMatchObject({ input_tokens: 40000, output_tokens: 30000, batch: true });
  });

  it("live, sends the first alone so the rest can read its cache, and keeps a failure to itself", async () => {
    const order: string[] = [];
    const stream = vi.fn((p: { messages: { content: string }[] }) => {
      const id = p.messages[0].content;
      order.push(`start ${id}`);
      return {
        on: () => undefined,
        finalMessage: async () => {
          order.push(`end ${id}`);
          if (id === "c") throw new Error("boom");
          return reply(id);
        },
      };
    });
    const client = { messages: { stream } } as unknown as Anthropic;
    const got = await runMessages(client, [named("a"), named("b"), named("c")], { mode: "live" });

    expect(order.slice(0, 2)).toEqual(["start a", "end a"]);
    expect(got.results.map((r) => [r.id, r.error])).toEqual([["a", null], ["b", null], ["c", "boom"]]);
    expect(got.usage.input_tokens).toBe(80000);
    expect(got.usage.batch).toBeUndefined();
  });

  it("cancels the batch when stopped", async () => {
    vi.useFakeTimers();
    const batches = {
      create: vi.fn(async () => ({ id: "batch_s", processing_status: "in_progress" })),
      retrieve: vi.fn(async () => ({ id: "batch_s", processing_status: "in_progress", request_counts: { succeeded: 0 } })),
      cancel: vi.fn(async () => ({})),
      results: vi.fn(),
    };
    const client = { messages: { batches } } as unknown as Anthropic;
    const controller = new AbortController();
    const running = runMessages(client, [named("a")], { mode: "batch", signal: controller.signal });
    await vi.advanceTimersByTimeAsync(10_000);
    controller.abort();
    await expect(drive(running)).rejects.toThrow();
    vi.useRealTimers();
    expect(batches.cancel).toHaveBeenCalledWith("batch_s");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/model/call.test.ts`
Expected: FAIL — `runMessages` is not exported.

- [ ] **Step 3: Implement in `src/lib/model/call.ts`**

3a. Change the pricing import at the top:

```ts
import { addUsage, type TokenUsage } from "../protocol/pricing.ts";
```

3b. Replace the polling section of `batched()` — from `const startedAt = now();` down to the end of its `try { … } catch { … }` block — with one call, and add `awaitBatch` above `batched()`:

```ts
/**
 * Waits for a batch to end, cancelling it if the wait is abandoned.
 *
 * Shared by the one-request and many-request paths, because the rule it
 * enforces is the one that costs money when forgotten: a batch nobody is
 * waiting for is still paid for when it ends.
 */
async function awaitBatch(
  client: Anthropic,
  batchId: string,
  status: string,
  options: CallOptions,
  now: () => number,
): Promise<void> {
  const startedAt = now();
  try {
    while (status !== "ended") {
      if (now() - startedAt > BATCH_TIMEOUT_MS) {
        throw new ModelCallError(
          "The batch did not finish within a day. Nothing is charged for a request that never ran. Start the build again, or set BUILD_MODE=live for an answer straight away.",
        );
      }
      await sleep(POLL_MS, options.signal);
      status = (await client.messages.batches.retrieve(batchId)).processing_status;
      options.onProgress?.(
        `${options.label ?? "Working"}. Waiting on the batch, ${waited(now() - startedAt)} so far.`,
      );
    }
  } catch (error) {
    await client.messages.batches.cancel(batchId).catch(() => undefined);
    throw error;
  }
}
```

and inside `batched()`, where the loop was:

```ts
  await awaitBatch(client, batch.id, batch.processing_status, options, now);
```

3c. Append after `runMessage`:

```ts
/* ---- many requests ------------------------------------------------------ */

export type NamedRequest = {
  id: string;
  params: Anthropic.Messages.MessageCreateParamsNonStreaming;
};
export type NamedResult = { id: string; message: Anthropic.Message | null; error: string | null };

const failure = (error: unknown) => (error instanceof Error ? error.message : String(error));

/**
 * Live: the first request alone, then the rest together.
 *
 * They share a cached prefix. Sent all at once, every one of them writes it
 * and none reads it; sent first, one request writes it and the others read it
 * at a tenth of the price. One failing request is recorded, not thrown, so the
 * others' answers are kept.
 */
async function manyLive(
  client: Anthropic,
  requests: NamedRequest[],
  options: CallOptions,
): Promise<NamedResult[]> {
  const one = async (r: NamedRequest): Promise<NamedResult> => {
    try {
      return { id: r.id, message: await live(client, r.params, { ...options, onUsage: undefined }), error: null };
    } catch (error) {
      if (options.signal?.aborted) throw error;
      return { id: r.id, message: null, error: failure(error) };
    }
  };
  const [first, ...rest] = requests;
  if (!first) return [];
  const head = await one(first);
  return [head, ...(await Promise.all(rest.map(one)))];
}

/**
 * Batched: every request in one batch, collected by custom_id.
 *
 * Results arrive in any order, so they are keyed, never read by position. A
 * many-request batch is not resumed after a dead build the way a document's
 * is: the caller stores what it needs from the results as soon as it has them.
 */
async function manyBatched(
  client: Anthropic,
  requests: NamedRequest[],
  options: CallOptions,
  now: () => number,
): Promise<NamedResult[]> {
  if (!requests.length) return [];
  const batch = await client.messages.batches.create({
    requests: requests.map((r) => ({ custom_id: r.id, params: r.params })),
  });
  await options.onBatch?.(batch.id);
  options.onProgress?.(
    `${options.label ?? "Working"}. Queued as a batch, which costs half as much and takes longer; you can close this tab.`,
  );
  await awaitBatch(client, batch.id, batch.processing_status, options, now);

  const got = new Map<string, NamedResult>();
  for await (const entry of await client.messages.batches.results(batch.id)) {
    const result = entry.result;
    got.set(
      entry.custom_id,
      result.type === "succeeded"
        ? { id: entry.custom_id, message: result.message, error: null }
        : {
            id: entry.custom_id,
            message: null,
            error:
              result.type === "errored"
                ? (result.error.error?.message ?? "The batched request failed.")
                : result.type === "canceled"
                  ? "The batched request was cancelled."
                  : "The batched request expired before it was processed.",
          },
    );
  }
  return requests.map(
    (r) => got.get(r.id) ?? { id: r.id, message: null, error: "The batch returned no result for this request." },
  );
}

export async function runMessages(
  client: Anthropic,
  requests: NamedRequest[],
  options: CallOptions = {},
  now: () => number = Date.now,
): Promise<{ results: NamedResult[]; usage: TokenUsage }> {
  const mode = options.mode ?? buildMode();
  const results =
    mode === "batch"
      ? await manyBatched(client, requests, options, now)
      : await manyLive(client, requests, options);
  const usage = results.reduce<TokenUsage>(
    (sum, r) => (r.message ? addUsage(sum, usageOf(r.message, mode)) : sum),
    ZERO,
  );
  return { results, usage };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/model/call.test.ts && npx tsc --noEmit`
Expected: all call tests PASS (old and new); tsc exits 0.

- [ ] **Step 5: Prove the tests can fail**

Return `results` unsorted from `manyBatched` (`[...got.values()]`); the order test must FAIL. Restore. Remove the `catch` cancel in `awaitBatch`; the stop test must FAIL. Restore.

- [ ] **Step 6: Commit**

```bash
git add src/lib/model/call.ts src/lib/model/call.test.ts
git commit -m "feat(model): many requests in one batch, collected by id and cancelled on Stop

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Reading the protocol's text and verifying quotes

**Files:**
- Create: `src/lib/checklist/text.ts`
- Create: `src/lib/checklist/verify.ts`
- Test: `src/lib/checklist/verify.test.ts`

**Interfaces:**
- Consumes: `CHECKLIST`, `CHECK_BY_ID`, `type Group` (Task 1); `type ModelCheck`, `type CheckResult` (Task 2).
- Produces: `type ProtocolPage = { label: string | null; text: string }`, `protocolPages(protocol: ExtractedProtocol): Promise<ProtocolPage[]>`, `isHeading(line: string): boolean`, `sectionsOf(text: string): ProtocolPage[]`; `skeleton(s: string): string`, `MIN_QUOTE`, `locate(pages: ProtocolPage[], quote: string): { found: boolean; location: string | null }`, `verifyResults(raw: ModelCheck[], pages: ProtocolPage[]): CheckResult[]`, `complete(results: CheckResult[], failedGroups: Group[]): CheckResult[]`.

- [ ] **Step 1: Write the failing test**

`src/lib/checklist/verify.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { isHeading, protocolPages, sectionsOf, type ProtocolPage } from "./text.ts";
import { complete, locate, skeleton, verifyResults } from "./verify.ts";
import type { ModelCheck } from "./schema.ts";

/** A valid PDF, one line of text per page, with correct xref offsets. */
function tinyPdf(pages: string[]): string {
  const objs: string[] = [];
  const kids = pages.map((_, i) => `${4 + i * 2} 0 R`).join(" ");
  objs.push("<< /Type /Catalog /Pages 2 0 R >>");
  objs.push(`<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>`);
  objs.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  pages.forEach((t, i) => {
    const stream = `BT /F1 12 Tf 72 720 Td (${t}) Tj ET`;
    objs.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${5 + i * 2} 0 R >>`,
    );
    objs.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  });
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objs.forEach((o, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  out += offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("");
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return out;
}

const pages: ProtocolPage[] = [
  { label: "p. 1", text: "A study of pain after surgery." },
  { label: "p. 2", text: "Sample size was calcu-\nlated using n = Z²pq/d², giving\n196 sessions." },
  { label: "p. 3", text: "Pain will be assessed post-operatively." },
];

const raw = (over: Partial<ModelCheck>): ModelCheck => ({
  check_id: "SS2", target: "", result: "FAIL", quote: "", note: "Wrong family.", ...over,
});

describe("reading the text", () => {
  it("reads a PDF page by page", async () => {
    const base64 = Buffer.from(tinyPdf(["First page words here", "Second page words here"])).toString("base64");
    const got = await protocolPages({ kind: "pdf", base64, filename: "p.pdf", bytes: 1 });
    expect(got.map((p) => p.label)).toEqual(["p. 1", "p. 2"]);
    expect(got[1].text).toContain("Second page words here");
  });

  it("splits plain text at its headings", () => {
    const got = sectionsOf("Intro text\n3. METHODOLOGY\nWe will enrol 40.\nSample size:\nn = 40 patients.");
    expect(got.map((p) => p.label)).toEqual([null, "Section: 3. METHODOLOGY", "Section: Sample size"]);
  });

  it("does not take a sentence or a long numbered item for a heading", () => {
    expect(isHeading("Patients will be enrolled.")).toBe(false);
    expect(isHeading("1. Patients aged 18 to 60 years with confirmed type 2 diabetes mellitus")).toBe(false);
    expect(isHeading("2.1 Study design")).toBe(true);
  });
});

describe("finding a quote", () => {
  it("ignores spacing, line breaks, hyphenation and quote style", () => {
    expect(locate(pages, "Sample size was calculated using n = Z²pq/d², giving 196 sessions")).toEqual({
      found: true,
      location: "p. 2",
    });
    expect(skeleton("“Pain” — post‑operatively")).toBe(skeleton('"Pain" - post-operatively'));
  });

  it("finds a quote that runs across two pages, at the first", () => {
    expect(locate(pages, "giving 196 sessions. Pain will be assessed").location).toBe("p. 2");
  });

  it("rejects a paraphrase", () => {
    expect(locate(pages, "Pain is measured after the operation").found).toBe(false);
  });

  it("will not verify a quote too short to mean anything", () => {
    expect(locate(pages, "pain").found).toBe(false);
  });
});

describe("verifying results", () => {
  it("adds the location, the fixed priority and the area", () => {
    const [r] = verifyResults([raw({ quote: "Pain will be assessed post-operatively", check_id: "OB4" })], pages);
    expect(r).toMatchObject({ location: "p. 3", quote_verified: true, needs_review: false, priority: "Major", area: "Objectives & outcomes" });
  });

  it("turns a failure resting on a quote the protocol lacks into a result to review", () => {
    const [r] = verifyResults([raw({ quote: "The sample size is 500 patients per arm" })], pages);
    expect(r).toMatchObject({ result: "NOT_STATED", quote_verified: false, needs_review: true, location: null });
    expect(r.note).toContain("Quote not found");
  });

  it("keeps a failure with no quote, since absence has nothing to quote", () => {
    const [r] = verifyResults([raw({ check_id: "SS11", quote: "" })], pages);
    expect(r).toMatchObject({ result: "FAIL", needs_review: false, location: null });
  });

  it("drops an ID that is not on the checklist", () => {
    expect(verifyResults([raw({ check_id: "ZZ9" })], pages)).toEqual([]);
  });
});

describe("completing the results", () => {
  it("answers every check exactly once or more, in checklist order", () => {
    const got = complete(verifyResults([raw({ check_id: "SS11" })], pages), []);
    const ids = new Set(got.map((r) => r.check_id));
    expect(ids.size).toBe(106);
    expect(got[0].check_id).toBe("DOC1");
  });

  it("answers DOC5 in code, and marks the unanswered and the failed-group checks for review", () => {
    const got = complete([], ["SS"]);
    expect(got.find((r) => r.check_id === "DOC5")).toMatchObject({ result: "NOT_APPLICABLE", needs_review: false, judged_by: "code" });
    expect(got.find((r) => r.check_id === "SS1")).toMatchObject({ result: "NOT_STATED", needs_review: true, note: "Check group failed." });
    expect(got.find((r) => r.check_id === "TI1")).toMatchObject({ note: "Not answered.", needs_review: true });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/checklist/verify.test.ts`
Expected: FAIL — cannot resolve `./text.ts`.

- [ ] **Step 3: Write `src/lib/checklist/text.ts`**

```ts
import type { ExtractedProtocol } from "../protocol/extract.ts";

/**
 * The protocol as text, in labelled pieces, for checking quotes.
 *
 * The model still reads a PDF natively; this text is never sent to it. It
 * exists so code can confirm that every quote the model gives is really in the
 * protocol, and say where. A PDF gives pages. A .docx or pasted text has no
 * pages, so it is cut at its headings and a quote is placed by section.
 */

export type ProtocolPage = { label: string | null; text: string };

export async function protocolPages(protocol: ExtractedProtocol): Promise<ProtocolPage[]> {
  if (protocol.kind === "pdf") {
    const { extractText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(new Uint8Array(Buffer.from(protocol.base64, "base64")));
    const { text } = await extractText(pdf, { mergePages: false });
    return text.map((t, i) => ({ label: `p. ${i + 1}`, text: t }));
  }
  return sectionsOf(protocol.text);
}

/**
 * A line that reads as a heading: short, not ending like a sentence, and
 * numbered, in capitals, or ending in a colon. A numbered list item is kept
 * out by length - "1. Patients aged 18 to 60 years with…" is a criterion, not
 * a section - since a wrong label sends the reader to the wrong place.
 */
export function isHeading(line: string): boolean {
  const t = line.trim();
  if (t.length < 3 || t.length > 80) return false;
  if (/[.;,]$/.test(t)) return false;
  if (t.split(/\s+/).length > 8) return false;
  const numbered = /^(\d+(\.\d+)*\.?|[IVX]+\.)\s+\S/.test(t);
  const capitals = t === t.toUpperCase() && /[A-Z]{3}/.test(t);
  return numbered || capitals || t.endsWith(":");
}

export function sectionsOf(text: string): ProtocolPage[] {
  const out: ProtocolPage[] = [];
  let label: string | null = null;
  let lines: string[] = [];
  const flush = () => {
    if (lines.join("").trim()) out.push({ label, text: lines.join("\n") });
  };
  for (const line of text.split(/\r?\n/)) {
    if (isHeading(line)) {
      flush();
      label = `Section: ${line.trim().replace(/:$/, "")}`;
      lines = [line];
    } else {
      lines.push(line);
    }
  }
  flush();
  return out;
}
```

- [ ] **Step 4: Write `src/lib/checklist/verify.ts`**

```ts
import { CHECKLIST, CHECK_BY_ID, type Group } from "./checks.ts";
import type { CheckResult, ModelCheck } from "./schema.ts";
import type { ProtocolPage } from "./text.ts";

/**
 * Every quote is checked against the protocol before anything is built on it.
 *
 * Matching is done on the letters and digits alone. A PDF's text layer breaks
 * lines mid-word, hyphenates, doubles spaces and turns quotes curly; a model
 * copying a sentence straightens them again. None of that changes what was
 * said, and all of it would defeat an exact match. A paraphrase changes the
 * letters, so it still fails - which is the one thing this check exists for.
 */

export function skeleton(s: string): string {
  return s.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
}

/** Shorter than this, a "quote" would match by accident somewhere in any protocol. */
export const MIN_QUOTE = 12;

export function locate(pages: ProtocolPage[], quote: string): { found: boolean; location: string | null } {
  const q = skeleton(quote);
  if (q.length < MIN_QUOTE) return { found: false, location: null };
  const skeletons = pages.map((p) => skeleton(p.text));
  for (let i = 0; i < pages.length; i++) {
    if (skeletons[i].includes(q)) return { found: true, location: pages[i].label };
    // A sentence can run over a page break.
    if (i + 1 < pages.length && (skeletons[i] + skeletons[i + 1]).includes(q)) {
      return { found: true, location: pages[i].label };
    }
  }
  return { found: false, location: null };
}

export function verifyResults(raw: ModelCheck[], pages: ProtocolPage[]): CheckResult[] {
  const out: CheckResult[] = [];
  for (const r of raw) {
    const item = CHECK_BY_ID.get(r.check_id);
    if (!item) continue;
    const base = { ...r, area: item.area, priority: item.priority, judged_by: item.judged_by };
    const quote = r.quote.trim();

    if (!quote) {
      out.push({ ...base, quote: "", location: null, quote_verified: false, needs_review: false });
      continue;
    }
    const hit = locate(pages, quote);
    if (hit.found) {
      out.push({ ...base, quote, location: hit.location, quote_verified: true, needs_review: false });
      continue;
    }
    // A finding that rests on words the protocol does not contain is not a
    // finding. It is kept for the panel, marked, and never raised as an issue.
    out.push({
      ...base,
      quote,
      result: r.result === "FAIL" ? "NOT_STATED" : r.result,
      note: `Quote not found in the protocol — needs review. ${r.note}`.trim(),
      location: null,
      quote_verified: false,
      needs_review: true,
    });
  }
  return out;
}

/** The checks answered in code, with their answers. */
const CODE_ANSWERS: Record<string, Pick<CheckResult, "result" | "note">> = {
  DOC5: { result: "NOT_APPLICABLE", note: "The app accepts one protocol file, so there is only one version." },
};

/**
 * Fills every check the model did not answer, so no result is ever blank, and
 * puts the whole list in checklist order.
 */
export function complete(results: CheckResult[], failedGroups: Group[]): CheckResult[] {
  const answered = new Set(results.map((r) => r.check_id));
  const filler: CheckResult[] = CHECKLIST.filter((c) => !answered.has(c.id)).map((c) => {
    const common = {
      check_id: c.id, target: "", quote: "", location: null, quote_verified: false,
      area: c.area, priority: c.priority, judged_by: c.judged_by,
    };
    const coded = CODE_ANSWERS[c.id];
    if (coded) return { ...common, ...coded, needs_review: false };
    return {
      ...common,
      result: "NOT_STATED" as const,
      note: failedGroups.includes(c.group) ? "Check group failed." : "Not answered.",
      needs_review: true,
    };
  });
  const order = new Map(CHECKLIST.map((c, i) => [c.id, i]));
  return [...results, ...filler].sort((a, b) => order.get(a.check_id)! - order.get(b.check_id)!);
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/lib/checklist/verify.test.ts && npx tsc --noEmit`
Expected: PASS (15 tests); tsc exits 0. If the PDF test fails because unpdf's `extractText` returns a different shape, print `await extractText(pdf, { mergePages: false })` in a scratch test and match its real fields.

- [ ] **Step 6: Prove the tests can fail**

Replace `skeleton` with `s => s.trim()`; the hyphenation test must FAIL. Remove the page-break branch; the two-page test must FAIL. Restore both.

- [ ] **Step 7: Commit**

```bash
git add src/lib/checklist/text.ts src/lib/checklist/verify.ts src/lib/checklist/verify.test.ts
git commit -m "feat(checklist): every quote is found in the protocol before it is believed

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Running the checklist

**Files:**
- Create: `src/lib/checklist/run.ts`
- Test: `src/lib/checklist/run.test.ts`

**Interfaces:**
- Consumes: `CALLS`, `VERSION`, `checksToAnswer`, `type Group` (Task 1); `groupRequest`, `CHECKLIST_MODEL` (Task 2); `groupAnswerSchema`, `type ModelCheck`, `type CheckResult` (Task 2); `runMessages`, `type Mode` (Task 3); `protocolPages`, `verifyResults`, `complete` (Task 4); `tablesFor` (Task 1); `addUsage`, `type TokenUsage` from `src/lib/protocol/pricing.ts`.
- Produces: `type ChecklistRun = { version: string; model: string; pagesRead: boolean; results: CheckResult[]; usage: TokenUsage }`, `parseAnswer(message: Anthropic.Message | null): ModelCheck[] | null`, `runChecklist(protocol: ExtractedProtocol, options?: { signal?: AbortSignal; onProgress?: (note: string) => void; mode?: Mode; client?: Anthropic }): Promise<ChecklistRun>`.

- [ ] **Step 1: Write the failing test**

`src/lib/checklist/run.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { parseAnswer, runChecklist } from "./run.ts";
import type { ExtractedProtocol } from "../protocol/extract.ts";

const protocol: ExtractedProtocol = {
  kind: "text",
  text: "4. SAMPLE SIZE\nA total of 40 patients will be enrolled over one year.\nNo allowance is made for dropouts.",
  filename: "p.docx",
  bytes: 100,
};

const msg = (text: string, stop = "end_turn") =>
  ({
    id: "m", model: "claude-sonnet-5", stop_reason: stop,
    content: [{ type: "text", text }],
    usage: { input_tokens: 100, output_tokens: 50, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
  }) as unknown as Anthropic.Message;

/** A live client that answers each call from `answer(groupsInThePrompt, attempt)`. */
function client(answer: (ask: string, attempt: number) => string) {
  const attempts = new Map<string, number>();
  const stream = vi.fn((params: Anthropic.Messages.MessageCreateParamsNonStreaming) => {
    const content = params.messages[0].content as { type: string; text?: string }[];
    const ask = content.at(-1)!.text!;
    const n = (attempts.get(ask) ?? 0) + 1;
    attempts.set(ask, n);
    return { on: () => undefined, finalMessage: async () => msg(answer(ask, n)) };
  });
  return { client: { messages: { stream } } as unknown as Anthropic, stream };
}

const empty = JSON.stringify({ checks: [] });

describe("parseAnswer", () => {
  it("reads a valid answer and refuses anything else", () => {
    expect(parseAnswer(msg(JSON.stringify({ checks: [{ check_id: "SS1", target: "", result: "PASS", quote: "", note: "" }] })))).toHaveLength(1);
    expect(parseAnswer(msg("not json"))).toBeNull();
    expect(parseAnswer(msg(empty, "max_tokens"))).toBeNull();
    expect(parseAnswer(null)).toBeNull();
  });
});

describe("runChecklist", () => {
  it("makes thirteen calls and returns every check, verified", async () => {
    const { client: c, stream } = client((ask) =>
      ask.includes("- SS11 ")
        ? JSON.stringify({ checks: [{ check_id: "SS11", target: "", result: "FAIL", quote: "No allowance is made for dropouts.", note: "None." }] })
        : empty,
    );
    const run = await runChecklist(protocol, { client: c, mode: "live" });

    expect(stream).toHaveBeenCalledTimes(13);
    expect(run.version).toBe("2026-09-27");
    expect(run.model).toBe("claude-sonnet-5");
    expect(run.pagesRead).toBe(true);
    expect(new Set(run.results.map((r) => r.check_id)).size).toBe(106);
    expect(run.results.find((r) => r.check_id === "SS11")).toMatchObject({
      result: "FAIL", quote_verified: true, location: "Section: 4. SAMPLE SIZE",
    });
    expect(run.usage.input_tokens).toBe(1300);
  });

  it("retries a group once, then marks its checks as failed", async () => {
    const { client: c, stream } = client((ask, attempt) => {
      if (ask.includes("- TI1 ")) return attempt === 1 ? "garbage" : empty;
      if (ask.includes("- SS1 ")) return "garbage";
      return empty;
    });
    const run = await runChecklist(protocol, { client: c, mode: "live" });

    expect(stream).toHaveBeenCalledTimes(15);
    expect(run.results.find((r) => r.check_id === "SS1")).toMatchObject({ note: "Check group failed.", needs_review: true });
    expect(run.results.find((r) => r.check_id === "TI1")?.note).toBe("Not answered.");
  });

  it("keeps only the IDs a call was asked for", async () => {
    const { client: c } = client((ask) =>
      ask.includes("- TI1 ")
        ? JSON.stringify({ checks: [{ check_id: "SS3", target: "", result: "FAIL", quote: "", note: "Out of place." }] })
        : empty,
    );
    const run = await runChecklist(protocol, { client: c, mode: "live" });
    expect(run.results.find((r) => r.check_id === "SS3")?.note).toBe("Not answered.");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/checklist/run.test.ts`
Expected: FAIL — cannot resolve `./run.ts`.

- [ ] **Step 3: Write `src/lib/checklist/run.ts`**

```ts
import Anthropic from "@anthropic-ai/sdk";
import type { ExtractedProtocol } from "../protocol/extract.ts";
import { addUsage, type TokenUsage } from "../protocol/pricing.ts";
import { type Mode, runMessages, type NamedRequest } from "../model/call.ts";
import { CALLS, VERSION, checksToAnswer, type Group } from "./checks.ts";
import { CHECKLIST_MODEL, groupRequest } from "./request.ts";
import { groupAnswerSchema, type CheckResult, type ModelCheck } from "./schema.ts";
import { tablesFor } from "./tables.ts";
import { protocolPages, type ProtocolPage } from "./text.ts";
import { complete, verifyResults } from "./verify.ts";

/**
 * The checklist stage: thirteen calls, one retry each, then code.
 *
 * What is returned is stored whole on the review row before the review is
 * written, so a build that dies and is resumed shapes its review with the same
 * findings its batch was sent with.
 */

export type ChecklistRun = {
  version: string;
  model: string;
  /** False when the protocol's text could not be read, so no quote could be verified. */
  pagesRead: boolean;
  results: CheckResult[];
  /** Priced at the checklist model's rates, apart from the review's. */
  usage: TokenUsage;
};

export function parseAnswer(message: Anthropic.Message | null): ModelCheck[] | null {
  if (!message || message.stop_reason === "refusal" || message.stop_reason === "max_tokens") return null;
  const text = message.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
  try {
    const parsed = groupAnswerSchema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data.checks : null;
  } catch {
    return null;
  }
}

const groupsOf = (id: string) => id.split("+") as Group[];

export async function runChecklist(
  protocol: ExtractedProtocol,
  options: {
    signal?: AbortSignal;
    onProgress?: (note: string) => void;
    mode?: Mode;
    client?: Anthropic;
  } = {},
): Promise<ChecklistRun> {
  const client = options.client ?? new Anthropic();
  const pages: ProtocolPage[] = await protocolPages(protocol).catch(() => []);
  const requests: NamedRequest[] = CALLS.map((groups) => ({
    id: groups.join("+"),
    params: groupRequest(protocol, groups, tablesFor(groups)),
  }));
  const callOptions = {
    signal: options.signal,
    onProgress: options.onProgress,
    mode: options.mode,
    label: "Checking the protocol against the checklist",
  };

  const first = await runMessages(client, requests, callOptions);
  let usage = first.usage;
  const answers = new Map(first.results.map((r) => [r.id, parseAnswer(r.message)]));

  // One retry, for the groups whose answer was missing or malformed.
  const retry = requests.filter((r) => !answers.get(r.id));
  if (retry.length) {
    const again = await runMessages(client, retry, callOptions);
    usage = addUsage(usage, again.usage);
    for (const r of again.results) answers.set(r.id, parseAnswer(r.message));
  }

  const failedGroups: Group[] = [];
  const raw: ModelCheck[] = [];
  for (const [id, checks] of answers) {
    if (!checks) {
      failedGroups.push(...groupsOf(id));
      continue;
    }
    // A call answers only the checks it was asked. An ID from another group
    // is dropped rather than trusted, since that group was judged elsewhere.
    const allowed = new Set(checksToAnswer(groupsOf(id)).map((c) => c.id));
    raw.push(...checks.filter((c) => allowed.has(c.check_id)));
  }

  return {
    version: VERSION,
    model: CHECKLIST_MODEL,
    pagesRead: pages.some((p) => p.text.trim()),
    results: complete(verifyResults(raw, pages), failedGroups),
    usage,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/checklist/run.test.ts && npx tsc --noEmit`
Expected: PASS (4 tests); tsc exits 0.

- [ ] **Step 5: Prove the tests can fail**

Remove the `allowed` filter; the "keeps only the IDs" test must FAIL. Remove the retry block; the retry test must FAIL. Restore both.

- [ ] **Step 6: Commit**

```bash
git add src/lib/checklist/run.ts src/lib/checklist/run.test.ts
git commit -m "feat(checklist): thirteen calls, one retry each, every check answered

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: The review asks for check IDs, and code shapes the result

**Files:**
- Modify: `src/lib/protocol/schema.ts` (add `check_ids` to key issues and action items; export `keyIssueSchema`)
- Modify: `src/lib/protocol/schema.test.ts` (sample gets `check_ids`)
- Create: `src/lib/checklist/report.ts`
- Test: `src/lib/checklist/report.test.ts`

**Interfaces:**
- Consumes: `CHECK_BY_ID`, `CHECKLIST`, `RANK`, `type Priority` (Task 1); `type CheckResult` (Task 2); `type ChecklistRun` (Task 5); `type ModelReview` from `src/lib/protocol/schema.ts`.
- Produces: in `schema.ts`: `keyIssueSchema`; `ModelReview["key_issues"][number]` and `["action_items"][number]` now carry `check_ids: string[]`. In `report.ts`: `raised(results): CheckResult[]`, `FINDINGS_INSTRUCTION: string`, `findingsBlock(results): string`, `missing(results, review: ModelReview): CheckResult[]`, `fallbackIssue(r: CheckResult): KeyIssue`, `footerLine(run: ChecklistRun | null): string`, `shapeReview(review: ModelReview, run: ChecklistRun): ModelReview`, `REPAIR_JSON_SCHEMA`, `repairRequest(gaps: CheckResult[], model: string): Anthropic.Messages.MessageCreateParamsNonStreaming`, `parseRepair(message: Anthropic.Message, gaps: CheckResult[]): KeyIssue[]`, `type KeyIssue`.

- [ ] **Step 1: Update `src/lib/protocol/schema.ts`**

Replace the `key_issues` and `action_items` entries of `modelReviewSchema`:

```ts
export const keyIssueSchema = z.object({
  heading: z.string().min(1),
  body: z.string().min(1),
  /** The checklist findings this issue covers. Stripped before rendering. */
  check_ids: z.array(z.string()),
});
```

(declared above `modelReviewSchema`), then inside `modelReviewSchema`:

```ts
  key_issues: z.array(keyIssueSchema).min(1),
```

and the action item object becomes:

```ts
    z.object({
      area: z.string().min(1),
      issue: z.string().min(1),
      change: z.string().min(1),
      check_ids: z.array(z.string()),
    }),
```

In `MODEL_REVIEW_JSON_SCHEMA`, change `key_issues.items` to `obj({ heading: str, body: str, check_ids: CHECK_IDS })` and add `check_ids: CHECK_IDS` to the `action_items` item `obj({...})`, with this constant declared after `strArray`:

```ts
const CHECK_IDS = {
  type: "array",
  items: str,
  description:
    "The checklist finding IDs this entry covers, e.g. ['SS2', 'SS3'], taken from the findings you were given. Empty only for an entry no finding covers.",
} as const;
```

`toReviewSpec` and `toActionSpec` already map only the rendered fields, so `check_ids` never reaches `reviewSpecSchema.strict()`.

- [ ] **Step 2: Update `src/lib/protocol/schema.test.ts`**

In `sampleModel()`, give every key issue and action item `check_ids: []`, e.g. `key_issues: [{ heading: "Design not stated", body: "Say it in words.", check_ids: [] }]`. Append this test inside `describe("toReviewSpec", …)`:

```ts
  it("strips the check IDs before the renderers see them", () => {
    const model = sampleModel();
    model.key_issues[0].check_ids = ["DE2"];
    const spec = toReviewSpec(model);
    expect(spec.key_issues[0]).toEqual(["Design not stated", "Say it in words."]);
    expect(reviewSpecSchema.safeParse(spec).success).toBe(true);
  });
```

Run: `npx vitest run src/lib/protocol/schema.test.ts`
Expected: PASS, including "is strict all the way down".

- [ ] **Step 3: Write the failing test for report.ts**

`src/lib/checklist/report.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import {
  fallbackIssue, findingsBlock, footerLine, missing, parseRepair, raised, repairRequest, shapeReview,
} from "./report.ts";
import { complete } from "./verify.ts";
import type { CheckResult } from "./schema.ts";
import type { ChecklistRun } from "./run.ts";
import type { ModelReview } from "../protocol/schema.ts";

const result = (over: Partial<CheckResult>): CheckResult => ({
  check_id: "SS2", target: "", result: "FAIL", quote: "", note: "Wrong family.",
  area: "Sample size", priority: "Critical", judged_by: "model-provisional",
  location: null, quote_verified: false, needs_review: false, ...over,
});

const results = complete(
  [
    result({ check_id: "SS2", quote: "n = Z²pq/d² giving 196 sessions", quote_verified: true, location: "p. 14" }),
    result({ check_id: "SS11", priority: "Minor", note: "No dropout." }),
    result({ check_id: "RB1", priority: "Major", area: "Randomisation & bias", note: "Not stated." }),
    result({ check_id: "TI1", result: "PASS", priority: "Minor" }),
    result({ check_id: "OB4", priority: "Major", quote: "invented words here", needs_review: true, result: "NOT_STATED" }),
  ],
  [],
);
const run: ChecklistRun = { version: "2026-09-27", model: "claude-sonnet-5", pagesRead: true, results, usage: { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 } };

const review = (over: Partial<ModelReview> = {}): ModelReview => ({
  protocol_line: "p", title: { as_written: "t", suggestions: [] }, type: { classification: "c", suggestions: [] },
  peco: { framework: "PECO", intro: "", rows: [] },
  objectives: { primary: { objective: "o", outcome: "o" }, secondary: [], exploratory: [] },
  sample_size: { what_they_did: "w", verdict: "v", issues: [] },
  key_issues: [
    { heading: "Minor wording", body: "Expand abbreviations.", check_ids: ["SS11"] },
    { heading: "[Minor] Sample size formula is wrong", body: "Use two means.", check_ids: ["SS2"] },
    { heading: "An issue of its own", body: "Seen by the reviewer.", check_ids: [] },
  ],
  footer: "Prepared for the candidate.",
  action_items: [
    { area: "Wording", issue: "i", change: "c", check_ids: ["SS11"] },
    { area: "Sample size", issue: "i", change: "c", check_ids: ["SS2"] },
  ],
  ...over,
});

describe("what is raised", () => {
  it("raises failures and silences, never passes or results to review", () => {
    const ids = raised(results).map((r) => r.check_id);
    expect(ids).toContain("SS2");
    expect(ids).toContain("RB1");
    expect(ids).not.toContain("TI1");
    expect(ids).not.toContain("OB4");
  });

  it("lists raised findings for the review, with priority and quote", () => {
    const block = findingsBlock(results);
    expect(block).toContain('- SS2 [Critical] Sample size: FAIL.');
    expect(block).toContain('Protocol: "n = Z²pq/d² giving 196 sessions".');
    expect(block).not.toContain("OB4");
  });
});

describe("coverage", () => {
  it("finds a Critical or Major finding no issue covers, and ignores Minor", () => {
    expect(missing(results, review()).map((r) => r.check_id)).toEqual(["RB1"]);
  });

  it("builds a plain issue from a finding's own text", () => {
    const issue = fallbackIssue(results.find((r) => r.check_id === "RB1")!);
    expect(issue).toEqual({
      heading: "Randomisation & bias: Randomisation sequence method not stated",
      body: "Not stated.",
      check_ids: ["RB1"],
    });
  });
});

describe("shaping the review", () => {
  const shaped = shapeReview(review(), run);

  it("tags each heading from the checklist, replacing any tag the model wrote", () => {
    expect(shaped.key_issues.map((i) => i.heading)).toEqual([
      "[Critical] Sample size formula is wrong",
      "[Minor] Minor wording",
      "An issue of its own",
    ]);
  });

  it("opens each tagged body with the verified quote and where it is", () => {
    expect(shaped.key_issues[0].body).toBe('Protocol says: "n = Z²pq/d² giving 196 sessions" (p. 14). Use two means.');
    expect(shaped.key_issues[1].body).toBe("Protocol says: nothing on this. Expand abbreviations.");
    expect(shaped.key_issues[2].body).toBe("Seen by the reviewer.");
  });

  it("orders the action list the same way", () => {
    expect(shaped.action_items.map((a) => a.area)).toEqual(["Sample size", "Wording"]);
  });

  it("adds the checklist line to the footer", () => {
    expect(shaped.footer).toBe(
      "Prepared for the candidate. Checked against checklist v2026-09-27: 106 checks, 3 failed (1 Critical, 1 Major, 1 Minor).",
    );
  });
});

describe("the footer line", () => {
  it("says when the checklist did not run", () => {
    expect(footerLine(null)).toBe("Checklist not run.");
  });

  it("says when no quote could be verified", () => {
    expect(footerLine({ ...run, pagesRead: false })).toContain("could not be read for quote checking");
  });
});

describe("the repair call", () => {
  const gaps = missing(results, review());

  it("asks only for the missing findings, on the given model", () => {
    const req = repairRequest(gaps, "claude-opus-5");
    expect(req.model).toBe("claude-opus-5");
    const ask = (req.messages[0].content as { text: string }[])[0].text;
    expect(ask).toContain("RB1");
    expect(ask).not.toContain("SS2");
  });

  it("keeps only issues that cover a gap", () => {
    const message = {
      stop_reason: "end_turn",
      content: [{ type: "text", text: JSON.stringify({ key_issues: [
        { heading: "Randomisation", body: "State the method.", check_ids: ["RB1"] },
        { heading: "Unrelated", body: "x", check_ids: ["TI6"] },
      ] }) }],
    } as unknown as Anthropic.Message;
    expect(parseRepair(message, gaps).map((i) => i.heading)).toEqual(["Randomisation"]);
  });

  it("returns nothing for a malformed answer", () => {
    const message = { stop_reason: "end_turn", content: [{ type: "text", text: "nope" }] } as unknown as Anthropic.Message;
    expect(parseRepair(message, gaps)).toEqual([]);
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npx vitest run src/lib/checklist/report.test.ts`
Expected: FAIL — cannot resolve `./report.ts`.

- [ ] **Step 5: Write `src/lib/checklist/report.ts`**

```ts
import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { keyIssueSchema, type ModelReview } from "../protocol/schema.ts";
import { CHECKLIST, CHECK_BY_ID, RANK, type Priority } from "./checks.ts";
import type { ChecklistRun } from "./run.ts";
import type { CheckResult } from "./schema.ts";

/**
 * From verified findings to the review the investigator reads.
 *
 * The review model still writes every sentence. What it no longer decides is
 * which findings exist, how serious each is, what the protocol said, or the
 * order they are read in: those come from the checklist, and are written into
 * the review by code, inside the fields the renderers already print. That is
 * how the report keeps its shape while its findings stop moving between runs.
 */

export type KeyIssue = ModelReview["key_issues"][number];

/** A failure, or a silence the protocol owed an answer to. Never a result to review. */
export function raised(results: CheckResult[]): CheckResult[] {
  return results.filter((r) => !r.needs_review && (r.result === "FAIL" || r.result === "NOT_STATED"));
}

export const FINDINGS_INSTRUCTION = `A fixed checklist has already been run on this protocol, and its findings are listed below. Every quote in them has been found in the protocol by code.

- Section 6 must cover every finding marked Critical or Major. Findings with one root cause may share one key issue.
- In each key issue and each action item, list in check_ids the IDs of the findings it covers.
- Do not put a priority tag in a heading, and do not repeat the quote in the body: both are added afterwards from the findings.
- You may raise an issue no finding covers, with empty check_ids, when it matters.`;

export function findingsBlock(results: CheckResult[]): string {
  const list = raised(results);
  if (!list.length) return "The checklist found no failures.";
  return list
    .map((r) => {
      const status = r.result === "FAIL" ? "FAIL" : "NOT STATED";
      const target = r.target ? ` (${r.target})` : "";
      const quote = r.quote_verified ? ` Protocol: "${r.quote}".` : "";
      return `- ${r.check_id} [${r.priority}] ${r.area}${target}: ${status}. ${CHECK_BY_ID.get(r.check_id)!.fails_when}.${quote} ${r.note}`.trim();
    })
    .join("\n");
}

/** One entry per raised ID, preferring the entry whose quote was verified. */
function raisedById(results: CheckResult[]): Map<string, CheckResult> {
  const out = new Map<string, CheckResult>();
  for (const r of raised(results)) {
    const held = out.get(r.check_id);
    if (!held || (!held.quote_verified && r.quote_verified)) out.set(r.check_id, r);
  }
  return out;
}

export function missing(results: CheckResult[], review: ModelReview): CheckResult[] {
  const covered = new Set(review.key_issues.flatMap((i) => i.check_ids));
  return [...raisedById(results).values()].filter((r) => r.priority !== "Minor" && !covered.has(r.check_id));
}

export function fallbackIssue(r: CheckResult): KeyIssue {
  return {
    heading: `${r.area}: ${CHECK_BY_ID.get(r.check_id)!.fails_when}`,
    body: r.note || "Found by the checklist.",
    check_ids: [r.check_id],
  };
}

function priorityOf(ids: string[], byId: Map<string, CheckResult>): Priority | null {
  let best: Priority | null = null;
  for (const id of ids) {
    const r = byId.get(id);
    if (r && (!best || RANK[r.priority] < RANK[best])) best = r.priority;
  }
  return best;
}

const rankOf = (p: Priority | null) => (p ? RANK[p] : 3);
const TAG = /^\[(Critical|Major|Minor)\]\s*/;

function quoteLine(ids: string[], byId: Map<string, CheckResult>): string {
  const best = ids
    .map((id) => byId.get(id))
    .filter((r): r is CheckResult => Boolean(r?.quote_verified))
    .sort((a, b) => RANK[a.priority] - RANK[b.priority])[0];
  if (!best) return "Protocol says: nothing on this.";
  return `Protocol says: "${best.quote}"${best.location ? ` (${best.location})` : ""}.`;
}

export function footerLine(run: ChecklistRun | null): string {
  if (!run) return "Checklist not run.";
  const ids = raisedById(run.results);
  const count = (p: Priority) => [...ids.values()].filter((r) => r.priority === p).length;
  const line = `Checked against checklist v${run.version}: ${CHECKLIST.length} checks, ${ids.size} failed (${count("Critical")} Critical, ${count("Major")} Major, ${count("Minor")} Minor).`;
  return run.pagesRead
    ? line
    : `${line} The protocol's text could not be read for quote checking, so no quote was verified.`;
}

export function shapeReview(review: ModelReview, run: ChecklistRun): ModelReview {
  const byId = raisedById(run.results);

  const key_issues = review.key_issues
    .map((issue, i) => {
      const p = priorityOf(issue.check_ids, byId);
      const heading = issue.heading.replace(TAG, "");
      const shaped = p
        ? { ...issue, heading: `[${p}] ${heading}`, body: `${quoteLine(issue.check_ids, byId)} ${issue.body}` }
        : { ...issue, heading };
      return { i, p, shaped };
    })
    .sort((a, b) => rankOf(a.p) - rankOf(b.p) || a.i - b.i)
    .map((x) => x.shaped);

  const action_items = review.action_items
    .map((a, i) => ({ a, i, p: priorityOf(a.check_ids, byId) }))
    .sort((x, y) => rankOf(x.p) - rankOf(y.p) || x.i - y.i)
    .map((x) => x.a);

  return {
    ...review,
    key_issues,
    action_items,
    footer: [review.footer.trim(), footerLine(run)].filter(Boolean).join(" "),
  };
}

/* ---- the repair call ---------------------------------------------------- */

export const REPAIR_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["key_issues"],
  properties: {
    key_issues: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["heading", "body", "check_ids"],
        properties: {
          heading: { type: "string" },
          body: { type: "string" },
          check_ids: { type: "array", items: { type: "string" } },
        },
      },
    },
  },
} as const;

/**
 * Asks for the key issues the review left out, and only those.
 *
 * It sees the findings, not the protocol: every finding already carries its
 * quote and note, and resending the protocol would cost more than the issues
 * are worth.
 */
export function repairRequest(
  gaps: CheckResult[],
  model: string,
): Anthropic.Messages.MessageCreateParamsNonStreaming {
  return {
    model,
    max_tokens: 16_000,
    thinking: { type: "adaptive" },
    output_config: { effort: "medium", format: { type: "json_schema", schema: REPAIR_JSON_SCHEMA } },
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `A protocol review left out these checklist findings. Write one key issue for each, in the review's style: a short heading, then one plain paragraph that names the problem and gives the fix. Put the finding's ID in check_ids. Do not add a priority tag or the quote; both are added afterwards.\n\n${findingsBlock(gaps)}`,
          },
        ],
      },
    ],
  };
}

export function parseRepair(message: Anthropic.Message, gaps: CheckResult[]): KeyIssue[] {
  if (message.stop_reason === "refusal" || message.stop_reason === "max_tokens") return [];
  const text = message.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
  const wanted = new Set(gaps.map((g) => g.check_id));
  try {
    const parsed = z.object({ key_issues: z.array(keyIssueSchema) }).safeParse(JSON.parse(text));
    if (!parsed.success) return [];
    return parsed.data.key_issues.filter((i) => i.check_ids.some((id) => wanted.has(id)));
  } catch {
    return [];
  }
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run src/lib/checklist/report.test.ts src/lib/protocol/schema.test.ts && npx tsc --noEmit`
Expected: PASS; tsc exits 0 (if `analyze.ts` fails to type-check because `check_ids` is now required, that is fixed in Task 7 — confirm the only tsc errors are there).

- [ ] **Step 7: Prove the tests can fail**

Remove `.replace(TAG, "")`; the tagging test must FAIL. Drop the `r.priority !== "Minor"` filter in `missing`; the coverage test must FAIL. Restore both.

- [ ] **Step 8: Commit**

```bash
git add src/lib/protocol/schema.ts src/lib/protocol/schema.test.ts src/lib/checklist/report.ts src/lib/checklist/report.test.ts
git commit -m "feat(checklist): the review names the findings it covers, and code sets their order, tags and quotes

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Wiring the checklist into the review call

**Files:**
- Modify: `src/lib/protocol/analyze.ts`
- Test: `src/lib/protocol/analyze.test.ts` (append)

**Interfaces:**
- Consumes: `ChecklistRun` (Task 5); `FINDINGS_INSTRUCTION`, `findingsBlock`, `missing`, `fallbackIssue`, `repairRequest`, `parseRepair`, `shapeReview`, `footerLine` (Task 6); `runMessage` (existing).
- Produces: `analyzeProtocol(protocol, options & { checklist?: ChecklistRun | null })` — `undefined` means not requested (old behaviour), `null` means the checklist stage failed; exported `reviewUserContent(protocol, checklist?)`, exported `coverMissing(client, review, run, options): Promise<{ review: ModelReview; usage: TokenUsage | null }>`.

- [ ] **Step 1: Write the failing tests** (append to `src/lib/protocol/analyze.test.ts`; merge the imports)

```ts
import { vi } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { coverMissing, reviewUserContent } from "./analyze";
import { complete } from "../checklist/verify";
import type { ChecklistRun } from "../checklist/run";
import type { ModelReview } from "./schema";

const protocol = { kind: "text" as const, text: "Protocol text.", filename: "p.docx", bytes: 14 };
const run: ChecklistRun = {
  version: "2026-09-27", model: "claude-sonnet-5", pagesRead: true,
  usage: { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
  results: complete([
    { check_id: "RB1", target: "", result: "FAIL", quote: "", note: "Not stated.", area: "Randomisation & bias",
      priority: "Major", judged_by: "model", location: null, quote_verified: false, needs_review: false },
    { check_id: "SS2", target: "", result: "FAIL", quote: "", note: "Wrong.", area: "Sample size",
      priority: "Critical", judged_by: "model-provisional", location: null, quote_verified: false, needs_review: false },
  ], []),
};
const review = {
  key_issues: [{ heading: "Formula", body: "Fix it.", check_ids: ["SS2"] }],
} as unknown as ModelReview;

describe("the review prompt", () => {
  it("carries the findings when the checklist ran", () => {
    const blocks = reviewUserContent(protocol, run) as { type: string; text?: string }[];
    const text = blocks.map((b) => b.text ?? "").join("\n");
    expect(text).toContain("<checklist_findings");
    expect(text).toContain("- RB1 [Major]");
  });

  it("is unchanged when it did not", () => {
    const text = (reviewUserContent(protocol) as { text?: string }[]).map((b) => b.text ?? "").join("\n");
    expect(text).not.toContain("checklist");
  });
});

describe("coverMissing", () => {
  const liveClient = (text: string) =>
    ({
      messages: {
        stream: vi.fn(() => ({
          on: () => undefined,
          finalMessage: async () => ({
            model: "claude-opus-5", stop_reason: "end_turn",
            content: [{ type: "text", text }],
            usage: { input_tokens: 10, output_tokens: 5, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
          }),
        })),
      },
    }) as unknown as Anthropic;

  it("adds the repair call's issue for a missing Major finding", async () => {
    const client = liveClient(JSON.stringify({ key_issues: [{ heading: "Randomisation", body: "State it.", check_ids: ["RB1"] }] }));
    const got = await coverMissing(client, review, run, { mode: "live" });
    expect(got.review.key_issues.map((i) => i.heading)).toEqual(["Formula", "Randomisation"]);
    expect(got.usage?.input_tokens).toBe(10);
  });

  it("falls back to the finding's own text when the repair fails", async () => {
    const got = await coverMissing(liveClient("garbage"), review, run, { mode: "live" });
    expect(got.review.key_issues.at(-1)?.check_ids).toEqual(["RB1"]);
  });

  it("makes no call when nothing is missing", async () => {
    const client = liveClient("{}");
    const full = { key_issues: [{ heading: "x", body: "y", check_ids: ["SS2", "RB1"] }] } as unknown as ModelReview;
    const got = await coverMissing(client, full, run, { mode: "live" });
    expect(got.usage).toBeNull();
    expect((client.messages.stream as unknown as { mock: { calls: unknown[] } }).mock.calls).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/protocol/analyze.test.ts`
Expected: FAIL — `coverMissing` / `reviewUserContent` are not exported.

- [ ] **Step 3: Implement in `src/lib/protocol/analyze.ts`**

3a. Imports (add):

```ts
import { addUsage } from "./pricing.ts";
import type { ModelReview } from "./schema.ts";
import type { ChecklistRun } from "../checklist/run.ts";
import {
  FINDINGS_INSTRUCTION,
  fallbackIssue,
  findingsBlock,
  footerLine,
  missing,
  parseRepair,
  repairRequest,
  shapeReview,
} from "../checklist/report.ts";
```

3b. Rename `userContent` to an exported `reviewUserContent(protocol, checklist?: ChecklistRun | null)` and put the findings before the instruction block:

```ts
export function reviewUserContent(
  protocol: ExtractedProtocol,
  checklist?: ChecklistRun | null,
): Anthropic.MessageParam["content"] {
  const findings = checklist
    ? [
        {
          type: "text" as const,
          text: `${FINDINGS_INSTRUCTION}\n\n<checklist_findings version="${checklist.version}">\n${findingsBlock(checklist.results)}\n</checklist_findings>`,
        },
      ]
    : [];
  // …the existing `instruction` constant, unchanged…

  if (protocol.kind === "pdf") {
    return [
      { type: "document", source: { type: "base64", media_type: "application/pdf", data: protocol.base64 } },
      ...findings,
      instruction,
    ];
  }
  return [
    { type: "text", text: `<protocol filename="${protocol.filename}">\n${protocol.text}\n</protocol>` },
    ...findings,
    instruction,
  ];
}
```

and in `analyzeProtocol` use `messages: [{ role: "user", content: reviewUserContent(protocol, options.checklist) }]`.

3c. Add `checklist?: ChecklistRun | null;` to the `options` type of `analyzeProtocol`, with this comment:

```ts
    /**
     * The verified checklist findings the review is written from. Undefined
     * when no checklist was asked for; null when its stage failed, which the
     * footer then says.
     */
```

3d. Add, above `analyzeProtocol`:

```ts
/**
 * Every Critical and Major finding reaches Section 6.
 *
 * The review is asked to cover them and usually does. What it leaves out gets
 * one short repair call - on the findings alone, in the same mode as the
 * review so it is priced the same - and whatever is still missing after that
 * is written from the finding's own text. A finding is never dropped because
 * a model forgot it.
 */
export async function coverMissing(
  client: Anthropic,
  review: ModelReview,
  run: ChecklistRun,
  options: { signal?: AbortSignal; mode?: Mode },
): Promise<{ review: ModelReview; usage: TokenUsage | null }> {
  const gaps = missing(run.results, review);
  if (!gaps.length) return { review, usage: null };

  let added: ModelReview["key_issues"] = [];
  let usage: TokenUsage | null = null;
  try {
    const call = await runMessage(client, repairRequest(gaps, MODEL), {
      signal: options.signal,
      mode: options.mode,
      label: "Adding the findings the review left out",
    });
    usage = call.usage;
    added = parseRepair(call.message, gaps);
  } catch (error) {
    if (options.signal?.aborted) throw error;
  }

  let next: ModelReview = { ...review, key_issues: [...review.key_issues, ...added] };
  next = { ...next, key_issues: [...next.key_issues, ...missing(run.results, next).map(fallbackIssue)] };
  return { review: next, usage };
}
```

3e. In `analyzeProtocol`, replace the final `return { spec: toReviewSpec(result.data), … }` with:

```ts
    let review = result.data;
    let total = usage;
    if (options.checklist) {
      options.onProgress?.("Checking every finding reached the review");
      const covered = await coverMissing(client, review, options.checklist, options);
      review = shapeReview(covered.review, options.checklist);
      if (covered.usage) total = addUsage(total, covered.usage);
    } else if (options.checklist === null) {
      review = { ...review, footer: [review.footer.trim(), footerLine(null)].filter(Boolean).join(" ") };
    }

    return {
      spec: toReviewSpec(review),
      actionSpec: toActionSpec(review),
      model: message.model,
      effort: EFFORT,
      usage: total,
    };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/protocol && npx tsc --noEmit`
Expected: PASS, including `budgets.test.ts` (the review call still uses `DOCUMENT_MAX_TOKENS`); tsc exits 0.

- [ ] **Step 5: Prove the tests can fail**

Make `coverMissing` return before the fallback line; the fallback test must FAIL. Restore.

- [ ] **Step 6: Commit**

```bash
git add src/lib/protocol/analyze.ts src/lib/protocol/analyze.test.ts
git commit -m "feat(review): written from the verified findings, with none of them left out

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Storage and the build

**Files:**
- Create: `supabase/migrations/0019_review_checklist.sql`
- Modify: `src/lib/jobs/run.ts` (reporter `spend`; checklist before review; stored on the row)

**Interfaces:**
- Consumes: `runChecklist`, `ChecklistRun` (Task 5); `analyzeProtocol` with `checklist` (Task 7); `costOf` (existing).
- Produces: `reviews.checklist jsonb` holding a whole `ChecklistRun`.

- [ ] **Step 1: Write the migration**

`supabase/migrations/0019_review_checklist.sql`:

```sql
-- The fixed checklist a review was written from.
--
-- One jsonb holding the whole run: the checklist version, the model that
-- answered it, whether the protocol's text could be read for quote checks,
-- every check result, and the checklist's own token usage. The usage lives
-- here rather than in `usage` because it is priced at the checklist model's
-- rates, not the review model's.
--
-- It is written as soon as the checklist finishes, before the review is sent,
-- so a build that dies and is resumed shapes its review with the same findings
-- its batch was sent with.
--
-- Nullable and additive: older reviews have no checklist and render as before.

alter table public.reviews add column if not exists checklist jsonb;
```

- [ ] **Step 2: Apply the migration — ask first**

This changes the live Supabase database. **Ask the user before running it.** With approval, apply it with the Supabase MCP `apply_migration` tool (name `0019_review_checklist`, the SQL above) against the project in `.env.local`'s `NEXT_PUBLIC_SUPABASE_URL`, then confirm with `list_tables` that `reviews.checklist` exists.

- [ ] **Step 3: Reporter spends in dollars as well as tokens** (`src/lib/jobs/run.ts`, inside `progress()`)

Add `let extra = 0;` beside `let banked = ZERO;`, change `const cost = () => costOf(MODEL, add(banked, live)).total;` to:

```ts
  // Dollars already spent at another model's rates - the checklist runs on
  // Sonnet 5 while `banked` is priced as the review model - added as money,
  // since tokens from two price lists cannot be summed and priced once.
  let extra = 0;
  const cost = () => costOf(MODEL, add(banked, live)).total + extra;
```

In `finished`, `done`, `cancelled` and `failed`, replace each `costOf(MODEL, X).total` with `costOf(MODEL, X).total + extra`, and add a method to the returned object:

```ts
    /** Money spent at other rates, for the job's running cost. */
    spend(dollars: number) {
      extra += dollars;
    },
```

- [ ] **Step 4: Run the checklist before the review** (`runReview` in `src/lib/jobs/run.ts`)

Add imports:

```ts
import { runChecklist, type ChecklistRun } from "../checklist/run.ts";
```

After the review row exists (`reviewRow` is set) and before `analyzeProtocol`, insert:

```ts
  // The checklist first. A resumed build reuses the findings its batch was
  // sent with; a fresh one runs the checklist and stores it at once. If the
  // stage fails the review still runs, and its footer says the checklist did
  // not - the user never loses a review to it.
  let checklist: ChecklistRun | null = null;
  if (orphan) {
    const { data } = await db.from("reviews").select("checklist").eq("id", reviewRow.id).maybeSingle();
    checklist = (data?.checklist as ChecklistRun | null) ?? null;
  } else {
    await report.step("Checking the protocol against the checklist");
    try {
      checklist = await runChecklist(protocol, { signal, onProgress: (m) => void report.step(m) });
      report.spend(costOf(checklist.model, checklist.usage).total);
      await db.from("reviews").update({ checklist }).eq("id", reviewRow.id);
    } catch (error) {
      if (signal.aborted) throw error;
      checklist = null;
    }
  }
```

and pass `checklist,` in the `analyzeProtocol(protocol, { … })` options.

- [ ] **Step 5: Verify**

Run: `npx vitest run && npx tsc --noEmit && npx eslint src/lib/jobs/run.ts`
Expected: all tests PASS; tsc and eslint exit 0.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0019_review_checklist.sql src/lib/jobs/run.ts
git commit -m "feat(jobs): the checklist runs before the review and is stored on its row

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: The checklist panel and its cost

**Files:**
- Create: `src/components/checklist-panel.tsx`
- Modify: `src/components/usage-panel.tsx` (`what` gains `"checklist"`; `UsageTotal` rows gain `also`)
- Modify: `src/app/(workspace)/protocols/[id]/review/page.tsx`
- Modify: `src/app/(workspace)/page.tsx`
- Test: `src/components/checklist-panel.test.ts`, `src/components/usage-panel.test.ts` (append)

**Interfaces:**
- Consumes: `ChecklistRun` (Task 5), `CHECKLIST` (Task 1), `complete` (Task 4).
- Produces: `ChecklistPanel({ run }: { run: ChecklistRun })`; `UsagePanel` accepts `what: "review" | "plan" | "checklist"`; `UsageTotal` rows accept `also?: { model: string | null; usage: TokenUsage | null } | null`.

- [ ] **Step 1: Write the failing tests**

`src/components/checklist-panel.test.ts`:

```ts
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ChecklistPanel } from "./checklist-panel.tsx";
import { complete } from "@/lib/checklist/verify";
import type { ChecklistRun } from "@/lib/checklist/run";

const run: ChecklistRun = {
  version: "2026-09-27", model: "claude-sonnet-5", pagesRead: true,
  usage: { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
  results: complete([
    { check_id: "TI1", target: "", result: "PASS", quote: "", note: "Named.", area: "Title", priority: "Minor",
      judged_by: "model", location: null, quote_verified: false, needs_review: false },
    { check_id: "SS3", target: "", result: "FAIL", quote: "A total of 40 patients", note: "Gives 52.",
      area: "Sample size", priority: "Critical", judged_by: "model-provisional", location: "p. 12",
      quote_verified: true, needs_review: false },
  ], []),
};
const html = renderToStaticMarkup(createElement(ChecklistPanel, { run }));

describe("the checklist panel", () => {
  it("counts the checks and the failures", () => {
    expect(html).toContain("Checklist (106 checks) · 1 failed · v2026-09-27");
  });

  it("lists failures before passes", () => {
    expect(html.indexOf(">SS3")).toBeLessThan(html.indexOf(">TI1"));
  });

  it("shows the quote, where it is, and that a verdict is provisional", () => {
    expect(html).toContain("“A total of 40 patients”");
    expect(html).toContain("p. 12");
    expect(html).toContain("◐");
  });

  it("marks results that need review", () => {
    expect(html).toContain("needs review");
  });
});
```

Append to `src/components/usage-panel.test.ts` (and add `UsageTotal` to its import):

```ts
describe("the checklist's cost", () => {
  it("names what the checklist wrote", () => {
    const html = render({ usage: run, model: "claude-sonnet-5", what: "checklist" });
    expect(html).toContain("What this checklist cost");
    expect(html).toContain("Checks written");
  });

  it("adds each review's checklist to the running total without counting it as a review", () => {
    const html = renderToStaticMarkup(
      createElement(UsageTotal, {
        rows: [{ model: "claude-sonnet-5", usage: run, also: { model: "claude-sonnet-5", usage: run } }],
      }),
    );
    // Each part is $0.40 live (see above); together $0.80, one review.
    expect(html).toContain("1 review");
    expect(html).toContain("$0.80");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/components`
Expected: FAIL — `checklist-panel.tsx` missing; `what: "checklist"` rejected by types / wrong label.

- [ ] **Step 3: Write `src/components/checklist-panel.tsx`**

```tsx
import { CHECKLIST } from "@/lib/checklist/checks";
import type { ChecklistRun } from "@/lib/checklist/run";
import type { CheckResult } from "@/lib/checklist/schema";

/**
 * Every check, with its answer, for anyone who wants to know why an issue was
 * raised - or why one was not. Collapsed, because the review is what most
 * readers came for; not printed, because the document keeps its shape.
 */

const SHOWN: Record<CheckResult["result"], string> = {
  FAIL: "Fail",
  NOT_STATED: "Not stated",
  PASS: "Pass",
  NOT_APPLICABLE: "N/A",
};
const ORDER: Record<CheckResult["result"], number> = { FAIL: 0, NOT_STATED: 1, PASS: 2, NOT_APPLICABLE: 3 };

export function ChecklistPanel({ run }: { run: ChecklistRun }) {
  const rows = [...run.results].sort((a, b) => ORDER[a.result] - ORDER[b.result]);
  const failed = new Set(
    run.results
      .filter((r) => !r.needs_review && (r.result === "FAIL" || r.result === "NOT_STATED"))
      .map((r) => r.check_id),
  ).size;

  return (
    <details className="no-print rounded-xl border border-border bg-surface px-5 py-4">
      <summary className="cursor-pointer text-sm font-semibold">
        {`Checklist (${CHECKLIST.length} checks) · ${failed} failed · v${run.version}`}
      </summary>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-muted">
              <th className="py-1.5 pr-2">ID</th>
              <th className="py-1.5 pr-2">Area</th>
              <th className="py-1.5 pr-2">Result</th>
              <th className="py-1.5 pr-2">Priority</th>
              <th className="py-1.5 pr-2">Protocol says</th>
              <th className="py-1.5">Where</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={`${r.check_id}-${i}`} className="border-t border-border align-top">
                <td className="py-1.5 pr-2 font-mono">
                  {r.check_id}
                  {r.judged_by === "model-provisional" && (
                    <span title="Judged by the model for now; code will check this later"> ◐</span>
                  )}
                </td>
                <td className="py-1.5 pr-2">{r.target ? `${r.area} · ${r.target}` : r.area}</td>
                <td className="py-1.5 pr-2">
                  {SHOWN[r.result]}
                  {r.needs_review && <span className="text-muted"> · needs review</span>}
                </td>
                <td className="py-1.5 pr-2">{r.priority}</td>
                <td className="py-1.5 pr-2">
                  {r.quote ? `“${r.quote}”` : "—"}
                  {r.note && <div className="text-muted">{r.note}</div>}
                </td>
                <td className="py-1.5">{r.location ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-muted">
        ◐ judged by the model for now; code will check these in a later version.
        {!run.pagesRead && " The protocol's text could not be read, so no quote was verified."}
      </p>
    </details>
  );
}
```

- [ ] **Step 4: Update `src/components/usage-panel.tsx`**

- `what?: "review" | "plan" | "checklist";`
- the output row label: `what === "plan" ? "Facts written" : what === "checklist" ? "Checks written" : "Review written"`
- `UsageTotal`'s row type becomes `{ model: string | null; usage: TokenUsage | null; also?: { model: string | null; usage: TokenUsage | null } | null }[]`, and its sums become:

```ts
  // A review's checklist is part of what that review cost, priced at its own
  // model's rates; it is added to the money and the tokens, not to the count.
  const alsoCost = (r: (typeof priced)[number]) =>
    r.also?.usage ? costOf(r.also.model, r.also.usage).total : 0;
  const alsoTokens = (r: (typeof priced)[number]) => (r.also?.usage ? totalTokens(r.also.usage) : 0);
  const total = priced.reduce((sum, r) => sum + costOf(r.model, r.usage!).total + alsoCost(r), 0);
  const tokens = priced.reduce((sum, r) => sum + totalTokens(r.usage!) + alsoTokens(r), 0);
```

- [ ] **Step 5: Wire the pages**

`src/app/(workspace)/protocols/[id]/review/page.tsx`:
- add `checklist` to the select string: `"id, status, error, markdown, spec, action_spec, answers, issue_answers, model, usage, checklist, created_at, protocols ( filename )"`
- imports: `import { ChecklistPanel } from "@/components/checklist-panel";` and `import type { ChecklistRun } from "@/lib/checklist/run";`
- after the existing `UsagePanel` block:

```tsx
      {review.checklist && (
        <UsagePanel
          usage={(review.checklist as ChecklistRun).usage}
          model={(review.checklist as ChecklistRun).model}
          what="checklist"
        />
      )}

      {review.checklist && <ChecklistPanel run={review.checklist as ChecklistRun} />}
```

`src/app/(workspace)/page.tsx`:
- select: `.select("model, usage, checklist_usage:checklist->usage, checklist_model:checklist->>model")`
- rows:

```tsx
            rows={reviews.map((r) => ({
              model: r.model,
              usage: (r.usage as TokenUsage | null) ?? null,
              also: r.checklist_usage
                ? { model: r.checklist_model as string | null, usage: r.checklist_usage as TokenUsage }
                : null,
            }))}
```

- [ ] **Step 6: Run tests and checks**

Run: `npx vitest run && npx tsc --noEmit && npm run lint`
Expected: all PASS; tsc and lint exit 0.

- [ ] **Step 7: Prove the tests can fail**

Remove `+ alsoCost(r)`; the total test must FAIL. Remove the sort in `ChecklistPanel`; the order test must FAIL. Restore both.

- [ ] **Step 8: Commit**

```bash
git add src/components/checklist-panel.tsx src/components/checklist-panel.test.ts src/components/usage-panel.tsx src/components/usage-panel.test.ts "src/app/(workspace)/protocols/[id]/review/page.tsx" "src/app/(workspace)/page.tsx"
git commit -m "feat(ui): every check and its answer on the review page, and what the checklist cost

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: End-to-end verification

**Files:** none new.

- [ ] **Step 1: Full suite, types, lint, build**

Run: `npx vitest run && npx tsc --noEmit && npm run lint && npm run build`
Expected: every test passes (≥ 636 old + the new ones), no type or lint errors, build succeeds. `src/lib/render/build_review_md.js` and `src/lib/render/docx.ts` show no diff: `git diff main --stat -- src/lib/render` prints nothing.

- [ ] **Step 2: Run the app from the worktree**

Run in the background: `npm run dev -- -p 3005`
Open `http://localhost:3005`, sign in, open an existing protocol's review page. Expected: an older review renders exactly as before (no checklist panel).

- [ ] **Step 3: Live check — ask the user first**

This spends real money and needs a funded `ANTHROPIC_API_KEY` (`src/lib/model/call.test.ts` notes the account had no credit). With the user's approval, and `BUILD_MODE=live` for speed:
1. Build the review for 2–3 real protocols, 3 times each.
2. For each protocol, read the three `reviews.checklist` rows from Supabase and compute the share of `(check_id, target) → result` pairs identical across the three runs. Target ≥ 95%.
3. Search every stored review's `markdown` for `Protocol says: "` and confirm each quoted string is in that run's checklist with `quote_verified: true`. Target: zero unverified quotes.
4. Record the per-review cost (review + checklist) against the pre-change average shown by `UsageTotal`.

Report the three numbers to the user as measured, including any shortfall.
