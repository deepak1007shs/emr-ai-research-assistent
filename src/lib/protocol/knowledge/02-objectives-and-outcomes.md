# Reference 2 — Objectives and Their Outcomes

An objective without a fully specified outcome is not an objective — it is a wish.
Your job here is to give **every** objective an outcome that a statistician could
analyse without asking a single question.

---

## Step 1 — Separate the objectives by rank

| Rank | Rule |
|---|---|
| **Primary** | Exactly **one**. It is the objective the study is powered for, and it must be the objective the title promises. |
| **Secondary** | Pre-specified, analysed, reported — but not powered. Keep to a number the sample can actually support. |
| **Exploratory** | Hypothesis-generating. Must be labelled as such, and must never be written up as a confirmed finding. |

Protocols routinely list six "objectives" with no rank. Assign the ranks yourself,
say that you have done so, and name which one you took as primary and why.

### Rank-level problems to flag

- **No identifiable primary objective**, or several competing for the role.
- **The primary objective does not match the study's headline.** The title promises
  diagnostic accuracy; the primary objective measures prevalence. Whichever is the real
  question, the title, the primary objective, the primary outcome, and the sample size
  must all name the *same* thing. This four-way alignment is the backbone of the review.
- **An objective bundles two designs** — "to determine the prevalence of X and to
  evaluate the effect of Y on X" is a cross-sectional aim welded to an interventional
  one. Split them, and say which one the study is actually designed and powered for.
- **Not answerable or not measurable** — "to study", "to evaluate", "to assess",
  "to understand", "to know" with no measurable act attached. Rewrite each as a verb a
  statistician can execute: estimate, compare, determine, correlate, quantify, measure.
- **Too many objectives for the sample.** Six objectives on n = 60 means each is
  underpowered. Say which to keep and which to demote to exploratory.
- **An objective with no corresponding variable in the proforma** — it cannot be
  answered with the data being collected.

---

## Step 2 — Give every objective a fully specified outcome

An outcome is complete only when all seven links of the chain are present:

| Link | Question | Example |
|---|---|---|
| 1. **What** | The exact construct | In-hospital all-cause mortality |
| 2. **How** | The operational definition | Death from any cause before discharge |
| 3. **Instrument** | The tool, assay, scale, or record | Hospital discharge record |
| 4. **Who / where** | Assessor and setting, and whether blinded | Treating unit, not blinded |
| 5. **Time point** | Exact timing, including baseline | Day 28 from randomisation |
| 6. **Units / scale** | Numeric unit or category set | Proportion (%) |
| 7. **Variable type** | Continuous, binary, ordinal, nominal, count, time-to-event | Binary |

Then classify it:

- **Role** — primary, secondary, exploratory, safety, or feasibility.
- **Domain** — mortality; clinical event; physiological/laboratory; symptom;
  functional status; quality of life; resource use / cost; process of care; adverse
  event; diagnostic performance; knowledge/attitude/practice.

### Outcome-level problems to flag

- **Not fully specified** — a missing instrument, time point, or unit is the most
  frequent single defect in thesis protocols. Name which link is missing.
- **Contradicting primary outcomes** — the objectives name one, the sample size powers
  another, the analysis plan tests a third. Quote each and state which must win.
- **Composite outcome undefined** — say exactly which components count, and whether the
  first event or any event triggers it.
- **A surrogate standing in for a clinical outcome** without acknowledgement
  (CD4 count for survival, radiographic change for function).
- **A predictor mislabelled as an outcome** — age, sex, and comorbidity are not outcomes.
- **A consequence measured as if it were a predictor** — measuring a variable that is
  actually caused by the outcome, then treating it as a risk factor. This is reverse
  causation built into the design.
- **A scale used without naming the version, range, direction, and cut-off** — "quality
  of life assessed by questionnaire" is not analysable.
- **Time point absent for a change score** — "improvement in pain" needs baseline and
  follow-up times.
- **Subjective outcome with an unblinded assessor** in a comparative study.
- **Follow-up shorter than the time the outcome needs to occur** — flag in Section 5 or 6.

---

## Step 3 — The variable necessity filter

**This step never produces output. There is no variables section in the review.**

Read the proforma / data-collection sheet only to detect problems, then convert any real
problem into a plain-words item in **Section 6**. Never render a variable table, a
variable list, or an itemised proforma.

Run the filter over what is collected:

1. **Is every variable tied to an objective, a confounder, an eligibility check, or a
   safety requirement?** If not, it is being collected because it is easy, not because
   it is needed.
2. **Is every variable that an objective needs actually present?**
3. **Are confounders that the analysis will have to adjust for being collected at all?**
4. **Is each variable defined well enough to enter a database** — type, unit, category
   set, and cut-off?

### The four variable problems worth writing up

Phrase each in plain words, with the fix:

- **Named as a category, never itemised.** The proforma says "comorbidities",
  "microbiological profile", "laboratory investigations", or "complications" as a single
  line. Each must be pre-listed as its own field with its type and permitted values,
  before data collection begins — otherwise every student records something different
  and the dataset cannot be cleaned afterwards.
- **A genuine confounder is not collected.** Disease severity, time from onset to
  therapy, prior treatment, comorbidity burden, and socio-economic status are the usual
  missing ones. An adjusted analysis is impossible for a variable that was never
  recorded, and this cannot be repaired later.
- **The candidate-predictor list exceeds the events available.** With fewer than about
  10 events per variable, a multivariable model overfits. Pre-select the predictors on
  clinical grounds, or reduce the model.
- **A generic panel over-listed.** Thirty laboratory fields collected because the panel
  exists, none tied to an objective. Trim to what the objectives and the confounder set
  require.

---

## Step 4 — The four-way alignment check

Before writing anything, line these up side by side:

```
TITLE  →  PRIMARY OBJECTIVE  →  PRIMARY OUTCOME  →  SAMPLE-SIZE CALCULATION
```

They must all name the same construct, in the same population, at the same time point.
Any break in that chain is a **Very Important Issue** and belongs in Section 6, stated
as plainly as: *"The title promises X, the primary objective measures Y, and the sample
size is computed for Z. Pick one — I recommend X — and rewrite the other two to match."*
