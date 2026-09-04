@AGENTS.md

# Working in this repository

## The comments are a failure log

The long comments in `src/lib/` record approaches that were tried and did not
work. Read them before proposing to redesign what a file does, and read the
comments on the types a function takes as well as the function's own.

The case that earned this rule: the descriptive tables make the model emit a row
for every variable, which is what makes their output grow without bound, and the
obvious saving is to have code derive the category rows from the plan's
`unit_coding` field instead. `tables/blocks.ts` already records that this was
tried and "gave two rows of nonsense for years" — `unit_coding` holds
"Male / Female" but also "Kuppuswamy education score, 1 (illiterate) to 7
(profession/honours)", where the slash separates nothing. That is why the model
supplies the categories and why code must not.

## The fixtures pass while the real documents fail

`src/lib/tables/real-plans.json` is not evidence. Prove a claim about a failing
build against the Supabase project, by reading `jobs` for the run and the
artifact table for the stage, against the registry sizes in the plan's spec.

The case that earned this rule is the one this repo already names in
`a892f21`, "seven defects the real documents showed and the fixtures did not."
It happened again: the shell tables' layout call was capped at half the output
budget every other document was written at, every fixture test passed, and only
the stored runs showed that a 44-variable study had already reached 83% of that
cap. A 78-variable study then truncated twice, five minutes a time. No fixture
could have shown it, and `budgets.test.ts` now holds the line it crossed.
