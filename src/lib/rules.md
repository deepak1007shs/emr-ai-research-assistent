# The rules a plan and a form are held to

Every rule this application enforces, and the check that enforces it. A rule
with no code beside it is an intention; each of these fails a build or raises a
finding on one, which is why they are worth writing down.

Read with `jobs/workflow.md`, which says when each check runs. This file says
what they insist on. Neither is a prompt: `test-rules.md`, `table-slots.md`,
`design-tables.md` and `design-variables.md` are the files the code reads.

Severity is not decoration. **ERROR** means the document is wrong and says so on
its own face; **WARN** means only the investigator can settle it. A finding of
either kind still produces the document: one that reports its own problems is
worth more than none.

## 1. Not extra, not less

The rule the whole application is built around, enforced in both directions and
between all three documents.

| Rule | Check |
|---|---|
| Every objective has a row in the analysis map | `MAP01` |
| Every analysis row points at a table | `TBL01` |
| Every table reports an analysis the plan declares | `TBL15` |
| Every objective's analysis has a table | `TBL14` |
| Every declared variable is reported by some table | `TBL33` |
| Every variable a table needs has a field on the form | `ROLL01`, `CRF09` |
| Every field on the form traces to an analysis or to a derived value | `CRF11`, `CRF13` |
| The plan misses nothing the protocol described | `COV01`, `TBLCOV01` |

A variable collected and never reported is a field somebody fills for nothing. A
variable reported and never collected is a table nobody can fill. Both are
found before data collection begins, which is the only time either is cheap.

## 2. One concept, one name

| Rule | Check |
|---|---|
| No id is used twice | `REF01`, `REF02` |
| No id names both a variable and an outcome | `REF11` |
| No two variables carry the same label | `REF03` |
| No two outcomes measure the same thing | `REF12` |
| Everything named resolves to something declared | `REF04`, `REF05`, `REF06`, `REF08`, `REF09`, `REF10` |

`columns.ts` gives every variable one datasheet name, and the plan, the form and
the tables all print that name. Three documents that call one thing three words
cannot be checked against each other by anyone, including this application.

## 3. The test is chosen by rule, never by the model

`choose-test.ts` reads `test-rules.md`. The model is asked what the study
measures and how; it is never asked which test to run.

| Rule | Check |
|---|---|
| The effect measure follows from the design before the test follows from the data type | `test-rules.md` |
| A common outcome gets a risk or prevalence ratio by log-binomial or modified Poisson, never an odds ratio | `TBL20`, `TBL31` |
| A skewed measure is never summarised by a mean | `TBL30` |
| A table reporting a comparison names the test it used | `TBL09`, `TBL10` |
| Every test the plan chooses has its assumptions stated | `MAP14` |
| A table reports only the estimate the plan chose for that outcome | `TBL20`, `TBL29` |

## 4. What a table must carry

| Rule | Check |
|---|---|
| Tables are numbered contiguously from 1, in block order | `TBL01`, `TBL02` |
| Blocks run descriptive, primary, secondary, exploratory | `TBL02` |
| Every study has a baseline table and a demography table | `TBL03`, `TBL27` |
| The primary outcome has a table | `TBL04`, `TBL21` |
| A table has at least two columns and at least one row to fill | `TBL05`, `TBL06`, `TBL07` |
| A descriptive table carries its denominator, in the title or a column heading | `TBL08` |
| Every effect estimate carries a 95% confidence interval | `TBL12` |
| An adjusted effect has an unadjusted one beside it | `TBL13` |
| A ratio has an absolute measure beside it | `TBL32` |
| A model column says what it holds constant, not what number it is | `TBL11` |
| A subgroup table has an interaction p column | `TBL22` |
| A baseline table names which of the seven descriptive slots it fills | `TBL26` |
| Nothing is reported twice the same way | `TBL19` |
| Cells stay blank | the layout never writes one |

## 5. What must not be adjusted for

| Rule | Check |
|---|---|
| A mediator is never adjusted for: it lies on the path being measured | `MAP17`, `TBL17` |
| A collider is never adjusted for: conditioning on it invents an association | `MAP17`, `TBL17` |
| A collected mediator or collider stays out of every model | `ROLL04` |
| Every covariate in an adjusted model is a declared, collected variable | `REF05`, `REF10`, `ROLL03` |
| A causal question with named confounders has a table that holds them constant | `TBL28` |
| A model is declared exploratory when the events cannot afford its predictors | the footnote states it before the data arrive |

## 6. What each design owes

`design-tables.md` and `design-variables.md` hold this; the checks read them.

| Rule | Check |
|---|---|
| A design reports the tables its design owes | `TBL25` |
| A randomised trial does not test its own baseline balance for significance | `TBL24` |
| A non-inferiority trial names both an intention-to-treat and a per-protocol population | `TBL34` |
| A plan naming several populations has a sensitivity table | `TBL23` |
| Subgroups are prespecified or there is nothing to tabulate | `TBL23` |
| An analysis population is defined | `MAP11` |

## 7. What a form may and may not collect

| Rule | Check |
|---|---|
| Sections are lettered A onward, each with fields | `CRF01`, `CRF02`, `CRF03` |
| A number field carries its unit | `CRF05` |
| The field type can hold what the plan says the variable is | `CRF08` |
| A derived value is never a field; its raw inputs are | `CRF07`, `CRF10` |
| Every visit the plan measures at has a section of the form filled at it | `CRF12` |
| No variable has two boxes in one section | `CRF14` |
| Every variable resolves to exactly one field | `ROLL01`, `ROLL05` |
| Identifiers and administrative fields are allowed, being capture and not analysis | exempt by role |

Blank responses only. A form that arrives with a value already in it is a form
that will be signed without being read.

## 8. What is done to collected data, and what is only reported

The line runs through `data/clean.ts` and it does not move.

**Corrected and logged**, because none of it can change what a value means:
whitespace; a category spelled two ways where the model has already grouped
them; a marker standing for nothing recorded; a unit repeated in every cell of
a column whose header carries it.

**Reported and left alone**, because each needs a judgement about the data:

| Rule | Check |
|---|---|
| A number that looks like a sentinel is not turned into a blank | `DATA02` |
| A value matching no category is not reassigned to one | `DATA03` |
| A row appearing twice is not deleted | `DATA04` |
| A plan variable the sheet does not hold is marked, not invented | `DATA10` |

A silent edit to research data is indistinguishable from fabrication when
somebody audits the thesis.

## 9. How the documents are written

| Rule | Where |
|---|---|
| Times New Roman, 12pt, black, plain tables with no fills | `render/house-style.ts` |
| No em dashes, en dashes, smart quotes, ellipses or arrow glyphs | `render/plain.ts` |
| No AI vocabulary | `AI_VOCABULARY` in `house-style.ts` |
| Unresolved items render as bold `TODO:`, never as a guess | the builders |
| The screen, the Word file and the Markdown say the same thing | `preview.test.ts` |

The last one has been broken three times and repaired three times. It is checked
now by comparing all three renderings of one plan, not by reading one of them.

## 10. What the format does not carry

The house documents render four parts: PICOT/PECO, Section 1, the Analysis Map,
Section 6, with the master variable list after the map. Everything else the plan
knows is resolved and then used, not printed: the statistical rules choose the
tests, the populations write the sensitivity table's rows, the assumption checks
write the footnotes.

One consequence is worth stating plainly, because it is a loss and not a saving:
**the multiplicity rule now appears nowhere in the rendered document.** The
composer that wrote it still exists, still tested, printed by nothing.
