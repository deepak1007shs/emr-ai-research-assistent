# What the Statistical Analysis Plan contains

The plan follows the route-map format, section for section:

| Section | What it holds |
|---|---|
| 0 | **Study at a Glance** — title, design, population, what is measured, primary outcome, main comparison, sample size, guideline. Plus a sample-size note giving the basis, not just the number. |
| — | **PICOT / PECOT** — the clinical question decomposed, then assembled into one sentence. PECOT where the investigator observes rather than assigns. |
| 1 | **Objectives as Answerable Questions** — aim, hypothesis, the primary estimand in all five ICH E9(R1) attributes, then primary, secondary and exploratory objectives. |
| 2 | **Variable Table** — one row per variable, grouped by role, with the priority confounders named. |
| 3 | **Analysis Map** — one row per objective: outcome, predictors, data type, test and the table it fills. Then how each outcome is defined, why each test was chosen, the degrees-of-freedom note, and what is deliberately not adjusted for. |
| 4 | **General Statistical Rules** — software, normality, summaries, significance, effect estimates, missing data, multiplicity, reproducibility. Then the analysis populations, baseline comparison, intercurrent events, testing hierarchy, subgroups and interim analyses. |
| 5 | **Step-by-Step Analysis Flow** — describe, unadjusted, adjusted, sensitivity. |
| 5A | **Assumption Checking** — grouped by test, each with how it is checked, what to do when it fails, and an example in the study's own clinical terms. |
| 6 | **Shell (Dummy) Tables** — a pointer to the Shell Tables document, which holds them. |
| 7 | **Needs Checking** — the decisions still open, to settle with the guide. |
| — | **Document control and sign-off** — version, dates, signatures, amendment log. |

`sap-route-map.docx` in this folder is the format rendered from the reference
study, so it can be opened rather than described.

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
