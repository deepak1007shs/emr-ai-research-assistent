# Where each table sits

The house skeleton: every table a thesis reports, and the slot it fills. Edit
this file to change the skeleton; `slots.ts` reads these rows and nothing else.

The slot is not the table's number. Tables are numbered from 1 through the whole
document, because that is what a supervisor writes when they say "see Table 7"
and what the analysis map cites. The slot is printed above the table as its
sub-heading, so a reader can see at a glance which part of the skeleton they are
in, and so a missing slot can be noticed.

**Columns.**

- `slot` - the label. `A0` is the participant-flow table and `A1` to `A7` the
  descriptive ones, `B1` to `B3` the primary outcome's block, `C` and `D` the
  patterns for the secondary and exploratory blocks, which are numbered to their objective at build time:
  `C1.1` is the first table of the first secondary objective, `D2` the second
  exploratory table.
- `block` - which of the four sections it belongs to.
- `role` - the table role that fills it, where code can tell. `-` where the slot
  is a descriptive table, because only a reader of the protocol can say whether
  a baseline table is demography or comorbidity; that one is chosen when the
  table is written and checked here afterwards.
- `title` - the sub-heading printed above the table.
- `holds` - what belongs in it. Printed nowhere; it is what the model is told
  when it lays the descriptive tables out.

| slot | block | role | title | holds |
|---|---|---|---|---|
| A0 | descriptive | flow | Participant flow | How many were approached, how many entered, and where the difference went. Before anything is described, because a reader checks it before believing any of it. |
| A1 | descriptive | - | Demography | Age, sex, residence, education, occupation, socioeconomic status. Who the patients were, before anything clinical. |
| A2 | descriptive | - | Comorbidities | Diabetes, hypertension, cardiac, renal, hepatic and respiratory disease, and any comorbidity index the protocol uses. |
| A3 | descriptive | - | Risk factors and exposures | Smoking, alcohol, occupational and environmental exposure, family history, and the exposure itself where the study has one. |
| A4 | descriptive | - | Baseline clinical values | Vital signs, anthropometry, severity scores, performance status, and any clinical measurement taken before the intervention. |
| A5 | descriptive | - | Baseline investigations | Haematology, biochemistry, microbiology, imaging and any other test result recorded at entry. |
| A6 | descriptive | - | Preoperative and pre-intervention data | What was decided or given before the intervention: preparation, prophylaxis, staging, planned procedure, ASA grade. |
| A7 | descriptive | - | Intraoperative and procedural data | Operative findings, what was done, duration, blood loss, and anything recorded in theatre. Surgical and procedural studies only. |
| B1 | primary | outcome | Primary outcome | The outcome itself: the groups across the top, the outcome down the side, and the estimates and the p value beside the counts they were computed from. The Total column is the whole cohort, before it is split. |
| B2 | primary | effect_adjusted | Adjusted analysis of the primary outcome | The same effect with the confounders held constant. Its own table because its rows are the predictors, not the outcome, and it reports the crude and adjusted estimate side by side. |
| B3 | primary | sensitivity | Sensitivity analysis for the primary outcome | The primary analysis repeated every other defensible way. Its own table because its rows are the analysis populations. |
| C | secondary | - | Secondary outcome | One block per secondary objective, numbered to it. Each gets one outcome table, and an adjusted one only where the objective is causal. |
| D | exploratory | subgroup | Exploratory analysis | Subgroup, interaction and correlation. Hypothesis-generating, not corrected for multiplicity, and never a confirmatory claim. |
