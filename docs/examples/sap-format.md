# What the Statistical Analysis Plan contains

The plan follows the route-map format, section for section:

| Section | What it holds |
|---|---|
| — | **PICOT / PECOT** — the clinical question decomposed, then assembled into one sentence. PECOT where the investigator observes rather than assigns. |
| 1 | **Objectives as Answerable Questions** — aim, hypothesis, the primary estimand in all five ICH E9(R1) attributes, then primary, secondary and exploratory objectives. |
| 2 | **Variable Table** — one row per variable, grouped by role, with the priority confounders named. |
| 3 | **Analysis Map** — one row per objective: outcome, predictors, data type, test and the table it fills. Then how each outcome is defined, why each test was chosen, the degrees-of-freedom note, and what is deliberately not adjusted for. |
| 4 | **General Statistical Rules** — software, normality, summaries, significance, effect estimates, missing data, multiplicity, reproducibility, and the sample-size basis rather than just the number. Then the analysis populations, baseline comparison, intercurrent events, testing hierarchy, subgroups and interim analyses. |
| 5 | **Step-by-Step Analysis Flow** — describe, unadjusted, adjusted, sensitivity. |
| 5A | **Assumption Checking** — grouped by test, each with how it is checked, what to do when it fails, and an example in the study's own clinical terms. |
| 6 | **Shell (Dummy) Tables** — a pointer to the Shell Tables document, which holds them. |

Three sections of the route-map template are deliberately not produced: the
Study at a Glance box, the Needs Checking list, and the sign-off block. The
sample-size basis, which the glance box carried, is kept and printed with the
statistical rules, because a target n without its assumptions is not a
calculation.

Two renderings of the same reference study sit in this folder, so the format can
be read rather than described:

- [example-sap.md](example-sap.md) - the whole plan as Markdown
- `sap-route-map.docx` - the same plan as Word, in the house style

Both come from `src/lib/render/sap-md.ts` and `sap-docx.ts`, which
[sap-md.test.ts](../../src/lib/render/sap-md.test.ts) holds to the same
sections in the same order. A second renderer that drifts is worse than no
second renderer: someone would read one and hand over the other.

The plan downloads in either format from its page.

## Two rules the format depends on

**The test is never written by the model.** It is chosen from the data type and
the comparison by [choose-test.ts](../../src/lib/sap/choose-test.ts), reading the
rule table in [test-rules.md](../../src/lib/sap/test-rules.md). The same study
therefore always yields the same plan, and the rule table is where a
disagreement about a test gets settled once.

**The assumptions belong to the test that was chosen.** They are written in a
second model call that is *given* the chosen tests, so the plan lists the
assumptions of the tests it runs and no others. An assumption for a test nobody
runs is the kind of noise that makes a plan look thorough while helping no one.

## Where the shell tables live

The route-map template carries the shell tables inside the plan as Section 6.
Here they are their own document, because they are built and downloaded
separately, and the plan's Section 6 points at them rather than repeating them.
Section 3's "→ Table #" resolves to the number in that document once it exists.
