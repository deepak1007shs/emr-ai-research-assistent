# A categorical outcome has no unit, and a stopped build is not running

## What happened

"thesis protocol saumya final bdi october.pdf", 14 Sep 2026. Three plan builds:
stopped at 05:27, stopped by Gate A at 06:56, stopped by Gate A again at 07:07.
Each Gate A stop read *"The primary outcome does not say the unit."* The primary
outcome is the type of bile duct injury under five classification systems: a
nominal outcome, which has categories and no unit. The reading left the unit
blank, as the Facts Sheet's own measure contract says a categorical measure's
unit is.

Separately, a stopped plan build leaves its row with no plan and no error, and
the plan page, which reads only the newest row, says "This plan is still
running" until another build finishes, hiding any earlier plan.

## 1. G-A2 asks for a unit only where the outcome is a number

- Required for `continuous`, `count`, `time_to_event`.
- Not required for `binary`, `nominal`, `ordinal`, `date`, `text`. Missing
  categories are S2-4's to report in a plan that is built, by the rule
  `37a6ea0` set: a gap the protocol leaves is a TODO, not a reason for no plan.
- The PICO outcome line prints the unit only where there is one.

## 2. The plan page knows a stopped build from a running one

Not by marking the row failed on Stop. `orphanOf` resumes an unfinished row's
batch on the next build, and on 14 Sep that collected an answer already paid
for instead of paying twice. A failed row is never resumed.

Instead the page asks whether a plan build is live: a `sap` or `both` job that
is `running` and not stalled (`isStalled`). A pure function decides:

| Newest row | Live build | Finished plan exists | Page shows |
|---|---|---|---|
| unfinished | yes | - | still running |
| unfinished | no | yes | that finished plan, with a line saying the last build was stopped |
| unfinished | no | no | "The last build was stopped before it finished", and a build button |
| anything else | - | - | as today |

## Tests

- G-A2 passes a nominal, ordinal and binary primary with a blank unit, and
  still fails a continuous, count and time-to-event primary without one.
- The PICO line has no empty unit.
- The page-state function, for each row of the table above.
- Each fix disabled makes a test fail.
