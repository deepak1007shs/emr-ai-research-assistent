@AGENTS.md

# Working in this repository

This application reviews a study protocol and builds a Statistical Analysis
Plan from it.

The plan was deleted on 2026-09-11 and rebuilt the same day against
`SAP_CRF_Generation_Process.docx`, because the old build's output was not good
enough to hand to a supervisor. That document diagnoses why in its §6.3: the
same protocol produced 16, 18, 19 and 20 shell tables on four runs, because the
model decided the table set, re-reasoned every test and re-worded every title.

## The model extracts, and nothing else

This is the architecture, and undoing it is how the old failure comes back.

`src/lib/facts/extract.ts` makes the one model call in the plan pipeline. It
produces the Locked Protocol Facts Sheet, which is facts a reader can point at
in the protocol. Everything after it is code:

| Module | Step | What it holds |
|---|---|---|
| `objectives/` | 1 | PICOT, the objectives, the fixed title-promise list |
| `variables/` | 2, 3 | The master variable list, roles per objective, promotion |
| `analysis/` | 4 | Decision tables A, B and C, as markdown read by code |
| `rules/` | 5 | Populations, multiplicity, assumptions, sensitivity rows |
| `tables/` | 6 | The shell tables, from the templates in `templates.md` |
| `checks/` | 7 | The 43-check registry, Gate A, Gate B |
| `sap/` | - | The pipeline, the markdown renderer, the Word renderer |

A step that needs a judgement rules cannot supply does not ask a model. It puts
the question in the Facts Sheet as a field the model filled once, or it writes a
bold `TODO:` and leaves the decision to the investigator.

The acceptance test is in `src/lib/sap/markdown.test.ts`: build the IDA-PREG
fixture twice and the two files are byte-identical, with the register Appendix B
pins - 16 numbered tables, 4 fit tables, 1 figure.

## The comments are a failure log

The long comments in `src/lib/` record approaches that were tried and did not
work. Read them before proposing to redesign what a file does, and read the
comments on the types a function takes as well as the function's own.

The case that earned this rule is also the case that shows how to overturn one.
The deleted table builder recorded that deriving a table's category rows in code
"gave two rows of nonsense for years", because the plan's `unit_coding` held
"Male / Female" but also "Kuppuswamy education score, 1 (illiterate) to 7
(profession/honours)", where the slash separates nothing. The comment was right
about that data. The rebuild derives those rows in code, because the Facts
Sheet's measure dictionary holds `options` as a **list** rather than as prose.
The way past a failure log is to change what made it true, not to try the same
thing again.

## The fixtures pass while the real documents fail

A fixture is not evidence. Prove a claim about a failing run against the
Supabase project, by reading `jobs` for the run and `reviews` or `sap_plans` for
what it produced.

The case that earned this rule is the one this repo names in `a892f21`, "seven
defects the real documents showed and the fixtures did not." It kept happening:
a layout call capped at half the output budget every other document used, with
every fixture test passing, and only the stored runs showing that a 44-variable
study had already reached 83% of the cap.

The rebuild's own version of it is `src/lib/sap/shapes.test.ts`. Everything
passed on the worked example - a two-arm randomised trial with a repeated
continuous primary - before a sweep over five other study shapes found five
defects in an afternoon: an observational plan whose objectives were on no
analysis population, a family whose only member was a safety outcome and so
printed no multiplicity line, a check that read "Time to haemoglobin of 11.0
g/dL or above" as a filled-in cell, a single-group study given a model with a
"group-by-time term", and the same study reporting a risk difference from
nothing. Real protocols are not all IDA-PREG.

## A check that cannot fail is not a check

Before committing a fix, disable it and confirm the test fails. This session
found several tests that passed vacuously: a title-promise entry that was never
exercised because the fixture had no such objective, and an assertion that the
shape question "contained" the words `rate of change` while the question it was
checking read "the rate of change in change in haemoglobin".
