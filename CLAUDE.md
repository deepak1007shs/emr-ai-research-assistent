@AGENTS.md

# Working in this repository

This application reviews a study protocol. It used to build three more
documents from that review — a Statistical Analysis Plan, its shell tables and a
case record form — and those were removed on 2026-09-11 because their output was
not good enough to hand to a supervisor. The history is in git; `git log --
src/lib/sap` still has all of it. Do not reintroduce any of it without being
asked.

## The comments are a failure log

The long comments in `src/lib/` record approaches that were tried and did not
work. Read them before proposing to redesign what a file does, and read the
comments on the types a function takes as well as the function's own.

The case that earned this rule came from the deleted table builder, and it is
worth keeping because the shape recurs: the obvious saving was to have code
derive a table's category rows from the plan's `unit_coding` field instead of
asking a model. It had been tried, and `blocks.ts` recorded that it "gave two
rows of nonsense for years" — `unit_coding` held "Male / Female" but also
"Kuppuswamy education score, 1 (illiterate) to 7 (profession/honours)", where
the slash separates nothing. The comment was the only thing that knew.

## The fixtures pass while the real documents fail

A fixture is not evidence. Prove a claim about a failing run against the
Supabase project, by reading `jobs` for the run and `reviews` for what it
produced.

The case that earned this rule is the one this repo names in `a892f21`, "seven
defects the real documents showed and the fixtures did not." It kept happening
after that: a layout call capped at half the output budget every other document
used, with every fixture test passing, and only the stored runs showing that a
44-variable study had already reached 83% of the cap. `budgets.test.ts` now
holds that line over the one builder that is left.
