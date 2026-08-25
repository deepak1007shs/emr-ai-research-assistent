# Answers to the issues, and a button per document

*Making the second half of the pipeline reachable in one click, and letting the
investigator's decisions reach the specification.*

## Context

The review already tells a student what is wrong with their protocol. The
specification then tries to encode the study *as corrected* rather than as
written, but nobody has told it what the corrections are, so the model guesses.

Meanwhile the route from a finished review to a document is two hops through a
button whose label names all three documents at once.

Two changes fix both.

## Decisions taken

| Question | Answer |
|---|---|
| Three buttons, or three generations? | **One specification, three buttons.** Separate generation would reintroduce the drift the architecture exists to prevent, and would cost money per press. |
| What do the answers do? | **They feed the specification.** Stored on the review, passed into every ingest stage as decisions that override the protocol where they conflict. |
| One box or one per issue? | **One box.** Free text is what the model reads best, and it lets the investigator answer one issue or all twelve in their own words. |

## The answers box

A single text area on the review page, with the numbered issues listed beside it
for reference. Saved against the review, so it survives and can be edited.

It reaches the model as the investigator's decisions, ranked above the protocol:
where the review says *no single primary outcome is defined* and the answer says
*the primary outcome is the conversion rate*, the case record form, the analysis
plan and the shell tables are all built around that.

This is the missing half of "encode the corrected study, not its mistakes".
Without it the model infers the correction; with it, it is told.

## A button per document

Three buttons replace the single build button. Each does whatever is needed:

| Specification state | What the button does |
|---|---|
| None yet | Builds it once, using the answers, then goes to sign-off |
| Built, unsigned | Goes to sign-off |
| Signed | Downloads that document |

The specification is built once whichever button is pressed first; the other two
are then free. Gate G0 is not skippable — a document button routes *to* sign-off
rather than around it, because that is the one place a human judgement is
required.

## Storage

One column, `reviews.answers text`. Everything else is UI over what exists.

## Verification

1. `tsc`, lint, build and the full suite clean.
2. A test proving the answers reach the ingest prompt, since an answers box that
   is silently ignored is worse than none.
3. A test per routing case: no spec, unsigned spec, signed spec.
4. End to end in the browser: type an answer, press one document button, sign
   off, download.

## Not in this change

Per-issue inputs, and editing the specification by hand. Both are worth doing
later; neither is needed to make the pipeline usable.
