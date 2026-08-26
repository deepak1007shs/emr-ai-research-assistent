# What the Statistical Analysis Plan contains

The plan follows the route-map format, section for section:

| Section | What it holds |
|---|---|
| — | **PICOT / PECOT** — the clinical question decomposed, then assembled into one sentence. PECOT where the investigator observes rather than assigns. |
| 1 | **Objectives as Answerable Questions** — aim, hypothesis, the primary estimand in all five ICH E9(R1) attributes, then primary, secondary and exploratory objectives. |
| 2 | **Variable Table** — one row per variable, grouped by role, with the priority confounders named. |
| 3 | **Analysis Map** — one row per objective, or per group of objectives that share an analysis. Each row carries the outcomes, the exposure kept apart from the confounders, the data type with the riders that change what may be reported, and the analysis itself: the unadjusted estimate, the adjusted model or the reason there is none, and every table it fills. Then how each outcome is defined, why each analysis was chosen, what must not be done, the degrees-of-freedom note, and what is deliberately not adjusted for. |
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

**The analysis is never written by the model.** It is planned by
[choose-test.ts](../../src/lib/sap/choose-test.ts) from the rule table in
[test-rules.md](../../src/lib/sap/test-rules.md), so the same study always
yields the same plan and the rule table is where a disagreement gets settled
once.

A rule returns a plan rather than a test name: the unadjusted estimate, the
model that holds confounders constant, and **what must not be done**. That last
column is what stops the errors a plan saying only what to do lets through in
silence — an odds ratio reported as a risk when the outcome is common, a
repeated-measures ANOVA that discards every patient with one missing time point,
Kaplan-Meier where a competing event prevents the outcome.

It keys on more than the data type: whether the measurements are independent,
paired or repeated, and for a binary outcome whether the event is common or
rare. Those are facts about the study, which the model supplies; what follows
from them is a rule, which it does not.

**The assumptions belong to the test that was chosen.** They are written in a
second model call that is *given* the chosen tests, so the plan lists the
assumptions of the tests it runs and no others. An assumption for a test nobody
runs is the kind of noise that makes a plan look thorough while helping no one.

## How it is built

Three model calls, and the split is not arbitrary.

1. **The frame and the registries** - the question, the estimand, the
   objectives, every variable and every outcome.
2. **The analysis map** - which points at the ids the registries declare, so it
   needs them as input whatever happens.
3. **The rules and the assumptions** - which is given the analyses code has
   already chosen, so it states the assumptions of the tests this study runs and
   no others.

The first two were one call until the API refused to compile the schema. Run
`preflight.ts` after changing any schema: it costs one token per schema and
answers the only question that cannot be answered offline.

## Where the shell tables live

The route-map template carries the shell tables inside the plan as Section 6.
Here they are their own document, because they are built and downloaded
separately, and the plan's Section 6 points at them rather than repeating them.
Section 3's "→ Table #" resolves to the number in that document once it exists.
