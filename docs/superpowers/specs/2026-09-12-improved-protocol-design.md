# The improved protocol, and the plan built from it

Design, 12 September 2026.

## Why

The review finds what is wrong with a protocol. The plan is then built from the
protocol anyway: `runSap` passes the document to `extractFacts` and nothing
else, so a design the review called mislabelled is still read as mislabelled,
and an outcome the review said was undefined is still undefined. The review page
meanwhile tells the investigator "the analysis plan is written against your
answers to it", which is not true and has never been true.

Two protocols showed what that costs. Dr Vishal's states five objectives and the
plan answered three, because the Facts Sheet has no field holding the objectives
as the protocol writes them, so no check could ask whether they all arrived. Dr
Arunesh's leaves a symptom duration with no unit, a "corrected PSA" nobody
defines and two Gleason scores with no categories; each became a TODO in a
document nobody had yet agreed to.

## The flow

```
Protocol
   -> Stage 1 review: findings and open decisions
   -> one box, always optional: anything to add or change
   -> Corrected Facts Sheet  -> Improved Protocol .docx
                             -> SAP .docx -> CRF .docx
```

One corrected object, rendered twice. The improved protocol and the plan cannot
disagree, because there is nothing for them to disagree about.

## Still one model call

`extractFacts` reads three things instead of one - the protocol, the review's
findings, and the investigator's note - with a stated precedence: the note wins
over the review, the review wins over the protocol where the protocol is silent
or wrong, and the protocol wins otherwise. The model still only extracts facts.
It is reading facts that now include what the investigator said.

Where the box is left empty the app applies the review's own recommendations,
and records each as its own decision. Nothing is invented silently: an applied
recommendation is a recorded decision, and a recorded decision is printed.

## Three fields

| Field | What it holds |
|---|---|
| `stated_objectives` | The protocol's objectives section, verbatim, one entry per objective, each naming the measure it is about and the factors it asks about. Copied, never merged or split. |
| `decisions` | Every open point that had to be settled, what was settled on, and by whom: `protocol`, `investigator` or `app`, with one line of why. |
| `investigator_note` | What was typed in the box. Stored on the plan row rather than in the Facts Sheet, because it is input to the reading and not a fact read from the protocol. |

## The check that makes this stick

`S1-5`, blocking: every stated objective reaches an objective id, or is recorded
as a decision. A protocol listing five objectives whose plan answers three
fails, naming the two that went missing. This is the check whose absence let two
of Dr Vishal's objectives become covariates.

It is structural, never a word match: a stated objective names its outcome
measure and its factors, and the check asks whether any outcome chain covers
them.

## The improved protocol document

Rendered by code from the corrected facts, with no prose written by a model:
title, aims, the objectives as answerable questions, population and eligibility,
each outcome with its instrument, timing and unit, the variable list, the sample
size with its formula, and the analysis summary. The decisions list is printed
at the front, each line marked with who made it, so a supervisor can see which
lines are the investigator's and which the application supplied.

## What it costs

One model call per build, as today. The rail becomes Review, Improved Protocol,
Plan, Form.

## Order of work

1. The two Facts Sheet fields, the precedence rule in the extraction, and
   `S1-5`.
2. The box and the build action on the review page, and the note column.
3. The Improved Protocol renderer and its page.
4. Verified on the fixtures only. No protocol is re-read until the investigator
   asks for it from the application.

## What this does not do

It does not decide medicine. A cut-off, an outcome definition or a grading
scheme the protocol never states is a decision the investigator owns; the
application proposes one, applies it when the box is empty, and prints who chose
it. The alternative - applying it silently - produces a document asserting
things its author never agreed to, which is the failure this build was rewritten
to prevent.
