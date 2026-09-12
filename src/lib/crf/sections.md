# Appendix A5: which section a field goes in, and in what order

Step 8 groups the fields "using role + timepoint from Step 2, mirroring the
reference", and lists the sections a diagnostic study has. A study that is not
one has blocks the list does not name - a study treatment, an operative record -
and the skill's own instruction covers them: place a field by its role and the
time it is collected, in its own section at that point in time.

That is what this table holds. `Key` is the class code decides for each field;
`Section` is the heading it is printed under, and `Order` is where that heading
sits in the form. Only the sections a study has are printed, and the letters are
assigned afterwards, so they always run A, B, C without a gap.

The order is the order the data arrive in, which is what makes a form fillable
at the bedside: who the patient is, then what was known before anything was
done, then what was measured, then what was found, then each follow-up visit.

`block:*` takes its heading from the measure dictionary's own words - the block
that names a descriptive table names the section that collects it - so a study
gets one section per block it records, in the order the dictionary lists them.

| Key | Section | Order |
|---|---|---|
| identifiers | Form and subject identifiers | 10 |
| group | Study group | 20 |
| block | | 30 |
| covariate | Comorbidity and treatment history | 40 |
| exposure | Factors under study | 50 |
| index_test | Index test | 60 |
| reference | Reference standard | 70 |
| outcome | Outcome assessment | 80 |
| visit | Follow-up visits | 90 |

A `block` row has no heading of its own because it carries the dictionary's
words instead. Everything the study records that fits no other class is a
descriptor, and a descriptor is what a block is for; a field that reaches this
table with no class at all is an outcome, because an outcome is the one thing
every study has.
