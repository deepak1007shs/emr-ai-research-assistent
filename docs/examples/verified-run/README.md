# One real run, end to end

The three documents in this folder were produced by the pipeline from
`JAY THESIS PROTOCOL .docx`, a real 45,000-character thesis protocol, with the
code as committed. They are here because until this run the second half of the
pipeline had never been exercised on anything but fixtures.

| Document | Built from |
|---|---|
| `sap.docx` | the protocol |
| `crf.docx` | the protocol and the plan |
| `tables.docx` | the plan and the form |

**What it cost:** $1.03 for all three at Sonnet 5 rates. The plan was $0.28, the
form $0.48, the tables $0.27. Output dominates: the three together read about
15,000 tokens of protocol and wrote about 52,000.

**What the checks said:** no errors. Three warnings, all of them the guards
working rather than faults:

- the adjusted model names nine predictors on ten expected events, so the plan
  declares it exploratory before the data arrive rather than after;
- two collected variables are mediators, which is fine, but they must stay out
  of every model.

**What to look at.** The plan's analysis map ends each row with the table that
answers it, and those numbers come from the shell tables, not from the plan: the
plan wrote T1 to T4 before it knew a baseline table would come first, and the
tables document, which owns the numbering, made them 2 to 5. The form collects
height and weight and two dates, and calculates body mass index and length of
stay from them rather than asking anyone to work them out by hand.

Regenerate with the script in the commit message for `fix(pipeline)`, or just
press the buttons in the app.
