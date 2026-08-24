# Reference 1 — Study Design Classification

Your job in this step is to name the **exact** design, not the family. "Observational
study" and "prospective study" are not answers. "Hospital-based prospective analytical
cross-sectional study" is an answer.

Work the steps in order. Do not jump to the intervention question first — Steps A–C
override it.

---

## Step A — Primary or secondary research?

| The protocol collects / uses | Family |
|---|---|
| New data from participants, records, or specimens | **Primary research** → Step B |
| Only already-published studies as the unit of analysis | **Evidence synthesis** → see § Evidence synthesis |
| An existing dataset collected for another purpose, re-analysed | **Primary research, secondary data** — still classify by Step D; say "secondary analysis of \<source\>" in the design name |

A registry-based or record-based study is **not** evidence synthesis. The unit of
analysis is the patient, not the paper.

---

## Step B — Quantitative, qualitative, or mixed?

| Data and analysis | Family |
|---|---|
| Numbers, counts, measurements, statistical inference | Quantitative → Step C |
| Interviews, focus groups, free text, thematic/framework/grounded-theory analysis | **Qualitative** → see § Qualitative |
| Both, with a stated integration point | **Mixed-methods** → see § Mixed-methods |

A quantitative study with one open-ended proforma question is not mixed-methods.
Mixed-methods requires a qualitative *strand* with its own sampling and analysis.

---

## Step C — AIM BEATS STRUCTURE (apply before Step D)

This is the single most commonly missed classification rule. Read the **aim**, not the
data-collection timing. If the aim matches a row below, that is the design, regardless
of what the protocol calls itself.

| If the aim is… | The design is… | Guideline |
|---|---|---|
| Measure sensitivity / specificity / PPV / NPV / AUC / likelihood ratios / agreement of a test against a reference standard | **Diagnostic accuracy study** | STARD |
| Build, validate, or update a model / score / nomogram that predicts an outcome | **Prognostic or diagnostic prediction-model study** (development / validation / both) | TRIPOD |
| Quantify agreement or repeatability between raters, methods, or occasions (kappa, ICC, Bland–Altman) | **Reliability / agreement study** | GRRAS |
| Compare cost against health outcome (ICER, cost per QALY) | **Economic evaluation** | CHEERS |
| Describe absorption/distribution/metabolism/excretion or establish bioequivalence | **PK / bioequivalence study** | — |
| Repeatedly cross a single patient between treatments | **N-of-1 trial** | CONSORT extension for N-of-1 |
| Develop or validate a questionnaire / scale (factor structure, internal consistency) | **Instrument development & validation study** | COSMIN |
| Measure how often an outcome occurs in a defined population at one time | Prevalence study → Step D (descriptive cross-sectional) | STROBE |

**The classic error:** a protocol titled "A cross-sectional study to evaluate the
diagnostic accuracy of X" is structurally cross-sectional but is a **diagnostic accuracy
study reported under STARD**. Its sample size must use a sensitivity/specificity formula,
not a prevalence formula. Say this explicitly when you see it.

The second classic error: "a cross-sectional study to identify predictors of mortality"
where mortality is ascertained later. If exposure and outcome are not measured at the
same point, it is not cross-sectional.

---

## Step D — Does the investigator allocate the exposure?

| | Family |
|---|---|
| The investigator assigns who gets what (drug, dose, procedure, programme) | **Interventional** → § Interventional |
| The investigator only observes and records what already happens | **Observational** → § Observational |

Giving a questionnaire, drawing an extra research blood sample, or performing an extra
scan is **not** an intervention — no health outcome is being allocated. Those remain
observational.

---

## § Interventional designs

First: **is allocation random?**

### Randomised
- **Parallel-group RCT** — participants randomised to arms, followed concurrently. Default.
- **Crossover RCT** — each participant receives both treatments in random order, with a washout. Requires a stable, reversible condition.
- **Cluster RCT** — the unit of randomisation is a ward, clinic, or village. **Sample size must be inflated by the design effect** `1 + (m − 1) × ICC`. A cluster trial powered with an individual-level formula is always wrong.
- **Factorial RCT** — two or more interventions randomised simultaneously (2×2).
- **Stepped-wedge** — clusters cross unidirectionally from control to intervention on a staggered schedule.
- **Non-inferiority / equivalence RCT** — the question is "not worse by more than Δ". **Requires a pre-stated non-inferiority margin Δ with clinical justification**, and a one-sided α. A non-inferiority trial with a superiority sample-size formula is a critical error.
- **Pilot / feasibility RCT** — the primary outcome is feasibility (recruitment rate, adherence, retention), *not* efficacy. Must not be powered for a clinical outcome, and must not claim efficacy.

Guideline: **CONSORT** (+ the matching extension: cluster, crossover, non-inferiority, pilot, N-of-1, herbal, TIDieR for intervention description).

### Non-randomised interventional
- **Single-arm / before–after (pre–post) study** — everyone gets the intervention; each participant is their own control. Cannot support a causal efficacy claim.
- **Non-randomised controlled trial (quasi-experimental)** — concurrent comparison group formed by convenience, ward, or period.
- **Interrupted time series** — repeated measures before and after a policy or programme change.

Guideline: **TREND** (non-randomised evaluations), or CONSORT-adjacent reporting.

**Flag:** a single-arm before–after study whose title says "efficacy of", "compare", or
"versus" is over-claiming. Either add a control arm or rewrite the objective as
"change in \<outcome\> from baseline".

---

## § Observational designs

### Descriptive (no comparison group by design)
- **Case report** — one patient. CARE guideline.
- **Case series** — a consecutive group with the same condition or exposure, no comparison group. Still requires explicit consecutive-vs-selected sampling.
- **Descriptive cross-sectional / prevalence survey** — measures how common something is at one point. Sample size: single-proportion (or single-mean) formula.
- **Ecological study** — the unit of analysis is a population, not a person. Beware the ecological fallacy; individual-level conclusions are not supported.

### Analytical (a comparison is built into the design)
- **Analytical cross-sectional** — exposure and outcome measured **at the same time**, groups compared. Produces prevalence ratios / odds; **cannot establish temporality**, so it cannot support "leads to", "causes", "predicts", or "risk factor for".
- **Case–control** — sampling starts from **outcome status**: cases with the disease, controls without. Looks backwards at exposure. Yields an odds ratio; **cannot yield prevalence or incidence**. Must specify how controls are selected and matched.
  - *Nested case–control* and *case–cohort*: cases and controls drawn from within an assembled cohort.
- **Cohort** — sampling starts from **exposure status**, follows for the outcome. Yields incidence, relative risk, hazard ratio.
  - *Prospective cohort* — outcomes have not occurred at enrolment.
  - *Retrospective (historical) cohort* — exposure and outcome are both already in the records, but the **design logic is still exposure → outcome**. This is not a cross-sectional study and not a case–control study.
  - *Ambidirectional* — both.
- **Case–crossover / self-controlled case series** — each case serves as their own control across time windows; for transient exposures with abrupt outcomes.

Guideline: **STROBE** (+ STROBE-MR, RECORD for routinely-collected data, STROBE-Vet).

### The three-question separator for observational designs

Ask in this order; it resolves almost every mislabelling:

1. **What decided who entered the study — their disease, their exposure, or neither?**
   Disease → case–control. Exposure → cohort. Neither (everyone in a defined population) → cross-sectional.
2. **Is there a time gap between measuring exposure and measuring outcome?**
   No gap → cross-sectional. Gap → cohort.
3. **What measure of association does the analysis produce?**
   Odds ratio only → case–control. Prevalence / prevalence ratio → cross-sectional. Incidence, RR, HR → cohort.

If the protocol's stated design fails any of these against its own methods, say so.

---

## § Qualitative

Name the **methodology**, not just "qualitative study":
phenomenology, grounded theory, ethnography, narrative inquiry, case study, or
**qualitative description** (the honest default for most thesis work).

Required elements: sampling strategy (purposive, maximum-variation, snowball,
theoretical), data-generation method (in-depth interview, FGD, observation),
**sample size justified by information power or data saturation — never by a
statistical formula**, analytic approach (thematic, framework, content, constant
comparison), and a reflexivity/trustworthiness statement (credibility, dependability,
confirmability, transferability).

Guideline: **COREQ** (interviews/focus groups) or **SRQR**.

**Flag:** a qualitative protocol that computes n from `4pq/d²` has confused paradigms.
Replace with saturation or information power.

---

## § Mixed-methods

Name the design and the integration point:
- **Convergent parallel** — both strands at once, merged at interpretation.
- **Explanatory sequential** — quantitative first, qualitative explains it.
- **Exploratory sequential** — qualitative first, builds the quantitative instrument.
- **Embedded** — one strand nested inside the other.

Guideline: **GRAMMS** (+ the guideline for each strand).

**Flag:** "mixed-methods" with no stated point of integration is two studies in one
document, not a mixed-methods design.

---

## § Evidence synthesis

- **Systematic review** ± **meta-analysis** — PRISMA (+ PRISMA-P for the protocol, MOOSE for observational).
- **Scoping review** — PRISMA-ScR. Maps the literature; does not answer an effect question.
- **Rapid / umbrella / narrative review** — name it honestly.

Required: registration (PROSPERO), at least two databases with a full search string,
dual independent screening and extraction, a named risk-of-bias tool (**RoB 2** for RCTs,
**ROBINS-I** for non-randomised, **QUADAS-2** for diagnostic accuracy, **Newcastle–Ottawa**
for observational), and a heterogeneity plan.

**Flag:** "systematic review" with one database, one reviewer, and no risk-of-bias tool
is a narrative review. Say so and give the fix.

---

## § Reporting guideline map

State the guideline in Section 2 every time. If the protocol names none, that is an issue.

| Design | Guideline |
|---|---|
| Randomised trial | CONSORT (+ extension) |
| Trial protocol | SPIRIT |
| Non-randomised intervention | TREND |
| Cohort / case–control / cross-sectional | STROBE |
| Routinely-collected health data | RECORD |
| Diagnostic / prognostic accuracy | STARD |
| Prediction model | TRIPOD |
| Reliability / agreement | GRRAS |
| Qualitative | COREQ / SRQR |
| Mixed-methods | GRAMMS |
| Systematic review / meta-analysis | PRISMA |
| Scoping review | PRISMA-ScR |
| Economic evaluation | CHEERS |
| Case report | CARE |
| Quality improvement | SQUIRE 2.0 |
| Animal research | ARRIVE |

---

## § PICO or PECO?

- **Interventional** → **PICO**: Population, **Intervention**, Comparator, Outcome.
- **Observational** → **PECO**: Population, **Exposure**, Comparator, Outcome.
- **Descriptive with no comparison** → still use PECO; write the Comparator row as
  "None — single-group descriptive design; no comparator by design", and say plainly
  that this limits the study to description.
- **Diagnostic accuracy** → PIRT is closer (Population, Index test, Reference standard,
  Target condition). Render it in the PICO/PECO table with those labels and say why.

Using PICO for an observational study is a real error. Flag it.

---

## § Title ↔ design consistency flags

Check every one of these and report what you find in Section 1 or 2:

1. **The design is absent from the title.** Nearly every thesis title should end with
   the design ("… : a hospital-based prospective observational cohort study").
2. **The title's design contradicts the methods.** Title says cross-sectional, methods
   follow patients for 6 months → it is a cohort.
3. **Over-claiming verbs without the design to support them** — "efficacy", "effect of",
   "impact of", "influence of", "role of", "predictors of", "causes" in a
   cross-sectional or single-arm study. Downgrade to "association between",
   "prevalence of", "change in".
4. **"Comparative" with no comparison group**, or "randomised" with no randomisation
   method.
5. **"Prospective" used as the design.** Prospective is *timing*. The design is cohort,
   RCT, or cross-sectional; prospective is an adjective on it.
6. **"Study to evaluate/assess"** — vague. Name the measurable act: "to estimate the
   prevalence of", "to compare the proportion of", "to determine the sensitivity of".
7. **Population and setting missing** from the title.
8. **Spelling, capitalisation, expanded abbreviations on first use, and units.**
9. **Aim-beats-structure mismatch** — the title names one design, the aim implies
   another (see Step C).

Always end Section 1 with **one suggested corrected full title** written out in full.
