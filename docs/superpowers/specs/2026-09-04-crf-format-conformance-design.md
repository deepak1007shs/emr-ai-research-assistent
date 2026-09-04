# The case report form, held to the format it was written against

## Why

Two case report forms for the same study were compared: one this application
produced, one produced by the `sap-analysis-map-builder` Claude skill, against
that skill's own `CRF_FORMAT_REFERENCE.docx` and `CRF_FORMAT_SPEC.md`.

Most of what looked like a gap was not one. The application already emits A4 at
one-inch margins with real Word styles — `Title`, `Heading2`, `Heading3` — and
no hard-coded font sizes, which is better than the reference itself, and better
than the third document in the comparison, which was US Letter with every
heading a plain paragraph at a hard size. Page setup and styles need nothing.

What the comparison did show is smaller and real: two things the form's own
data model carries and the renderer never prints, and one instruction vaguer
than the skill's.

Nothing here changes which fields the form collects. That logic — every
variable the plan declares gets a field, derived ones included, with their
ingredients captured alongside — stays as it is. It is computed from the
registries in `src/lib/crf/required.ts` and enforced by `CRF01` to `CRF14`,
where the skill states the same rule as prose for a model to follow. The
comment in that file records what happens when it is only prose: asked for a
trial with thirteen outcomes, the model promised a field for each and then
wrote half the form.

## What changes

### 1. A date says what order its numbers go in

`CrfField.mask` is declared in `src/lib/crf/types.ts`, set to `DD/MM/YYYY` in
the fixture, and read by nothing. `responseFor` in `src/lib/crf/response.ts`
prints `___ / ___ / ______` and stops.

The reference prints `___ / ___ / ______  (DD/MM/YYYY)` — two spaces before the
bracket. Match it exactly, for `Date` and for `Text / Date`.

Where the model supplies no mask, default to `DD/MM/YYYY` rather than printing
nothing. A date box with no stated order is the commonest transcription error on
a paper form, and these forms are filled in India, where no other reading is
plausible. A mask the model does supply is printed as given.

### 2. A multi-select says that more than one box may be ticked

`Multi-select` is a distinct `FieldType` and renders identically to
`Single-select`, so nothing on the page tells a data collector they may tick
more than one. `CRF_FORMAT_SPEC.md` requires the label to carry
"(tick all that apply)".

Append it in the renderer, not the prompt. A per-field instruction is a thing
the model can apply to four fields out of five, and the fifth is the one that
gets filled in wrong.

### 3. Sections grouped by role, not by the model's judgement of a topic

The section description in `src/lib/crf/build.ts` says sections are "named by
topic". The skill maps roles to named sections: identifiers, demographics,
history blocks, presenting symptoms, comorbidity and treatment history,
examination and pre-operative, index test split into parts, reference standard
or outcome source.

Adopt that map in the prompt, keeping the existing rule that anything collected
repeatedly gets a section per visit. This is a prompt change and therefore shifts
a tendency rather than guaranteeing a result; the lettering and the parts are
already checked by `CRF02`.

### 4. The gaps in an answer space survive to the page

Written into this spec first as "does not change", on the strength of
`responseFor` returning `☐ Male   ☐ Female` and the reference printing the same
three spaces. The rendered document printed one.

`plain()` ends by collapsing every run of two or more spaces to a single space.
That is right for a sentence — several of the punctuation substitutions above it
leave doubled spaces behind — and wrong for a form, where the gap between two
ballot boxes is what stops them reading as one choice. Every form this
application has produced printed a single space, and the unit test that asserted
three passed throughout, because it asked `responseFor` and never asked the
document.

Add `spaced()` beside `plain()` in `src/lib/render/plain.ts`: the same
punctuation substitutions, without the collapse. The form's table cells use it;
prose paragraphs keep `plain`. This also settles the two spaces before a date's
mask, which would have been collapsed the same way.

## What does not change

Page size, margins, styles, fonts. The application already emits A4 at one-inch
margins with real Word styles.

The three-space option separator is what the reference uses. The skill's own run
printed one and is wrong against its own reference — a deviation to ignore, not
a target to copy.

## Testing

In `src/lib/render/crf-docx.test.ts`:

- a `Date` field carrying a mask renders it, in the reference's exact spacing;
- a `Date` field with no mask renders the default rather than nothing;
- a `Multi-select` label carries "(tick all that apply)" and a `Single-select`
  label does not;
- options remain three-spaced.

And one conformance test that walks the field-type table in
`CRF_FORMAT_SPEC.md` — Text, Number with and without a unit, Single-select,
Multi-select, Date — asserting each renders as the spec's row says. The spec is
then checked rather than remembered, which is the only way it survives the next
change to the renderer.

One test must read the finished document rather than `responseFor`, asserting
the three-space separator and the mask's two spaces survive to the page. Every
other spacing test in this file asks the function and would pass while the
document was wrong, which is how the collapse went unnoticed.

The shared fixture gains no `Multi-select` field: eight other test files read
it, and a field the plan does not declare is what `CRF11` exists to object to.
The end-to-end case clones the fixture and retypes one field instead, which is
already the idiom in `preview.test.ts`.

## Verification

`npx vitest run`, `npx tsc --noEmit`, `npx eslint` — all three clean, with the
new cases failing first and passing after.
