# Every field can be answered, and every measurement is recorded whole

## What happened

The investigator read Dr Vishal's Case Record Form (built 14 Sep 2026, 04:51) and
found three errors. Traced through the stored form, the plan, the reading and
the code:

| Error | Cause | Layer |
|---|---|---|
| Date of admission, Date of surgery as text | the reading typed them `date`; `fields.ts` put every administrative item into a `"text"` field | form code |
| Time of injury, Time of revascularization, Mobile number as text | the type list has no clock time and no telephone number, so `text` was the only choice | vocabulary |
| Systolic blood pressure without diastolic | the proforma says "BP"; the reading recorded one measure, systolic | reading |
| Level of vascular injury, Postoperative complications: single-select, no options | the reading had no categories; S2-4 failed and named both; the form ignored that failure and printed an empty cell | form code |

Every form check passed. They test structure (numbering, pre-filled cells,
traces), not whether a field can be answered.

The times are the worse half: duration of ischaemia, the primary's first factor,
is derived from two free-text times with no date beside them.

## The rules, for every protocol

### 1. A field takes its variable's type (form code)
Administrative items take the field type of their data type, as every other
field does. A date is a date.

### 2. A choice with no choices says so (form code)
A categorical field with fewer than two options prints a written line, carries a
bold TODO in its label naming the gap, and the form's open items say which
fields they are. It is never an empty cell.

### 3. `datetime` and `phone` (vocabulary; changes what the model is asked)
- `datetime`: a date with a clock time. For any moment a duration is computed
  from, and anything timed within a day. Field: date then time,
  `___ / ___ / ______  ___ : ___  (DD/MM/YYYY HH:MM, 24-hour)`.
- `phone`: a telephone number. Field: a line for digits,
  `____________________  (digits)`. Never analysed.
- The instruction says both, and says a duration's inputs are dates or
  datetimes, never text.

### 4. A measurement taken as a pair is recorded whole (reading)
The instruction says a proforma item that is several values measured together is
one measure per value: blood pressure is systolic and diastolic.

## The checks that make each rule fail when broken

| Id | Type | Rule | Catches |
|---|---|---|---|
| S2-6 | block | Every input a number is computed from is a number, a date or a datetime, never text. | a duration from free-text times, whatever the reading does |
| S2-7 | warn | A measurement taken as a pair is recorded whole: systolic with diastolic blood pressure. | BP recorded as one value |
| CRF-3 | block | Every field can be answered as its variable is typed: its field type is the one its data type owes, and a choice lists at least two choices. | rules 1 and 2, and any field whose type drifts from its variable |

S2-6 and S2-7 are Step 2 checks, so the plan reports them; CRF-3 is the form's.
They join the registry with a note, as S1-5 did.

## Cost and scope

- Rules 1 and 2 change code only. Vishal's form can be rebuilt from its stored
  plan at no charge.
- Rules 3 and 4 change the model's request. The facts fingerprint is re-pinned
  with the reason; the review's is untouched. They take effect when a protocol
  is next read. Vishal's is not re-read here: the investigator starts that from
  the application.

## Tests

- Each rule on a fixture, and each check failing on the defect it names.
- Vishal's stored reading: S2-6 fails on the two times, S2-7 warns on blood
  pressure, CRF-3 fails on the two option-less fields, before any fix to the
  reading; after rules 1 and 2 the form's dates are date fields and the empty
  choices carry their TODO.
- IDA-PREG still builds byte for byte, 16 / 4 / 1.
- Every fix disabled makes a test fail.
