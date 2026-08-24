# Reference 3 — Methodology and the Sample-Size Correctness Check

---

## Part A — Methodology elements to summarise and check

### Study population and setting
Name the setting (hospital-based / community-based / multicentre), the source
population, and the recruitment period with dates. "Patients attending the department"
is not a population — say which department, which hospital, over which months.

### Eligibility
Inclusion and exclusion criteria must be **operational**: age range with units, a stated
diagnostic criterion or case definition with its reference, and a defined severity or
stage where relevant.

Common gaps to flag:
- Exclusions listed that merely restate the inclusions in the negative.
- Pregnancy, lactation, and paediatric status not addressed where the exposure demands it.
- No handling of patients who meet criteria more than once (re-admissions) — is the unit
  the patient or the episode?
- "Patients not willing to consent" listed as an exclusion criterion. That is a refusal,
  not an eligibility criterion; it belongs in the participant flow.
- No case definition for the condition being studied.

### Sampling technique
Name it exactly: complete enumeration, consecutive, simple random, systematic,
stratified, cluster, multistage, purposive, or convenience.

- **Consecutive sampling is not random sampling.** Most hospital thesis protocols use
  consecutive enrolment and call it "simple random sampling". Correct it and say the
  honest name, then note the selection-bias implication in the limitations.
- If a random method is claimed, the **sampling frame** and the randomisation mechanism
  must be described. No frame → it is not random.
- Time-bound recruitment ("all patients over 18 months") is complete enumeration of a
  period, not random sampling.

### Allocation and blinding (interventional only)
Sequence generation, allocation concealment (sealed opaque sequentially numbered
envelopes / central randomisation), who is blinded (participant, provider, outcome
assessor, analyst), and how blinding is maintained. Allocation concealment and blinding
are different things — protocols routinely conflate them.

### Data collection and follow-up
Who collects, using what instrument, at what time points, and with what training and
inter-observer standardisation. For follow-up designs: the schedule, the definition of
loss to follow-up, and the expected attrition.

**Flag when follow-up is shorter than the time the primary outcome needs to occur.**
Three months of follow-up cannot measure recurrence with a median time to recurrence of
nine months.

### Statistical analysis plan
Check that each named test matches the variable type and design:

| Comparison | Correct test |
|---|---|
| Two independent groups, continuous, normal | Independent *t*-test |
| Two independent groups, continuous, non-normal | Mann–Whitney U |
| Paired continuous, normal / non-normal | Paired *t*-test / Wilcoxon signed-rank |
| >2 independent groups, continuous | One-way ANOVA / Kruskal–Wallis |
| Repeated measures over time | Repeated-measures ANOVA or mixed-effects model |
| Two categorical variables | Chi-square, or Fisher exact when expected cell count <5 |
| Paired categorical | McNemar |
| Two continuous variables | Pearson (normal) / Spearman (non-normal) |
| Binary outcome, multiple predictors | Multivariable logistic regression → adjusted OR |
| Time-to-event | Kaplan–Meier + log-rank; Cox proportional hazards → adjusted HR |
| Clustered or repeated outcomes | Mixed-effects model or GEE |
| Agreement, categorical / continuous | Cohen or weighted kappa / ICC + Bland–Altman |
| Diagnostic accuracy | Sensitivity, specificity, PPV, NPV, LR with **95% CIs**; ROC/AUC |

Analysis-level problems to flag:
- **No adjustment plan for confounders** in an analytical study — bivariate *p*-values
  alone cannot support an association claim.
- No statement of how normality will be assessed.
- No plan for missing data.
- No effect estimates with confidence intervals — *p*-values only.
- Multiple comparisons with no adjustment or acknowledgement.
- For an RCT: no statement of intention-to-treat versus per-protocol.
- Software and version not named.

### Ethics and regulatory
Institutional Ethics Committee approval, written informed consent in a language the
participant understands, **assent for minors aged 7–17 plus parental consent**, the
process for vulnerable groups and for unconscious or critically ill patients (legally
acceptable representative), confidentiality and de-identification, data storage and
retention, and conflict of interest.

- **Any interventional study must be prospectively registered (CTRI in India).** Flag
  its absence.
- Flag a waiver of consent claimed for a record-based study without stating the criteria
  under which the committee may grant it.

---

## Part B — The sample-size correctness check

Give a **verdict**, then the fixes. The verdict is one of:

| Verdict | Meaning |
|---|---|
| **Correct** | The right formula for the design and the primary outcome, with every input stated and sourced, and arithmetic that reproduces. |
| **Partial** | Right formula, but inputs unsourced, attrition ignored, or the arithmetic cannot be reproduced. |
| **Wrong formula** | The formula does not match the design or the primary outcome. |
| **Absent** | No calculation, or "n = 100 as per convenience / departmental norm / previous studies". |

Always check these five things:

1. **Does the formula match the primary outcome's type?** (proportion / mean / OR / HR /
   correlation / sensitivity / agreement)
2. **Is every input stated *and* referenced?** p, σ, Δ, α, β, and the citation the
   number came from. An assumed σ with no source is unverifiable.
3. **Does the arithmetic reproduce?** Recompute it. State the number you get.
4. **Is attrition / non-response added?** `n_final = n / (1 − dropout)`.
5. **Is it powered for the *primary* outcome, not a secondary one?**

### The formulas

Z values: α = 0.05 two-sided → Z = 1.96; power 80% → Z = 0.84; power 90% → Z = 1.28.

**Single proportion (prevalence / descriptive cross-sectional)**
```
n = Z²₁₋α/₂ · p(1 − p) / d²          d = absolute precision
n = Z²₁₋α/₂ · (1 − p) / (ε² · p)     ε = relative precision
```
Finite population: `n_adj = n / (1 + (n − 1)/N)`.

**Single mean**
```
n = Z²₁₋α/₂ · σ² / d²
```

**Two independent proportions**
```
n per group = [ Z₁₋α/₂ √(2p̄q̄) + Z₁₋β √(p₁q₁ + p₂q₂) ]² / (p₁ − p₂)²
p̄ = (p₁ + p₂)/2
```

**Two independent means**
```
n per group = 2σ² (Z₁₋α/₂ + Z₁₋β)² / Δ²
```

**Paired means (crossover, before–after)**
```
n = σ²_d (Z₁₋α/₂ + Z₁₋β)² / Δ²      σ_d = SD of the within-person difference
```
Using the between-person SD here inflates n substantially. A common error.

**Case–control (odds ratio)**
Convert the expected OR into the case exposure proportion, then use the two-proportion
formula:
```
p₁ = (OR · p₀) / (1 + p₀(OR − 1))    p₀ = exposure prevalence in controls
```
With *r* controls per case, cases needed:
```
n_cases = [ Z₁₋α/₂ √((1 + 1/r) p̄q̄) + Z₁₋β √(p₁q₁ + p₀q₀/r) ]² / (p₁ − p₀)²
```

**Correlation**
```
n = [ (Z₁₋α/₂ + Z₁₋β) / C ]² + 3     C = 0.5 · ln[(1 + r)/(1 − r)]
```

**Diagnostic accuracy (sensitivity / specificity)**
```
n_diseased    = Z²₁₋α/₂ · Sn(1 − Sn) / d²      →  N_total = n_diseased / prevalence
n_nondiseased = Z²₁₋α/₂ · Sp(1 − Sp) / d²      →  N_total = n_nondiseased / (1 − prevalence)
```
Take the **larger** total. A diagnostic study powered with a plain prevalence formula is
a wrong-formula verdict — it ignores that precision is needed in *both* the diseased and
non-diseased strata.

**Time-to-event**
Power on **events**, not participants:
```
events = 4 (Z₁₋α/₂ + Z₁₋β)² / (ln HR)²        (equal allocation)
n = events / overall probability of the event during follow-up
```

**Agreement**
- ICC: Bonett's approximation, needs expected ρ, number of raters *k*, and target CI width.
- Kappa: needs expected κ, the marginal prevalence of the category, and precision.
A kappa study powered by a proportion formula is wrong.

**Cluster-randomised**
```
n_cluster-adjusted = n_individual × DE,   DE = 1 + (m − 1) × ICC
```
*m* = average cluster size. Also state the number of clusters — a trial with very few
clusters is underpowered no matter how many individuals it holds.

**Non-inferiority**
```
n per group = 2σ² (Z₁₋α + Z₁₋β)² / (Δ − δ)²    δ = non-inferiority margin
```
One-sided α. **The margin must be pre-stated and clinically justified.** No margin → the
calculation cannot be checked and the design is not interpretable.

**Multivariable models (rule of thumb, not a formula)**
- Logistic and Cox: at least **10 events per candidate predictor**; 20 is safer.
  Events, not participants — 300 patients with 12 deaths supports **one** predictor.
- Linear regression: 10–15 participants per predictor.
- Prediction-model development: use the Riley et al. criteria, not events-per-variable
  alone.

**Qualitative** — no formula. Justify by **information power** or by an a-priori
saturation rule ("interviews continue until no new codes appear across three
consecutive interviews"). A statistical formula in a qualitative protocol is an error.

**Pilot / feasibility** — not powered for efficacy. A defensible rule of thumb is 25–35
per group for estimating a variance to plan the main trial, and the protocol must say the
study is not designed to test effectiveness.

### The frequent errors, in order of how often they appear

1. No calculation at all — "50 cases as per convenience" or "as per departmental norm".
2. Formula does not match the design (prevalence formula in a comparative or diagnostic study).
3. Inputs pulled from a cited study whose population, outcome definition, or setting differs.
4. σ, p, or Δ stated with no source at all.
5. Arithmetic that does not reproduce — recompute and state your number against theirs.
6. Attrition or non-response never added.
7. Powered for a secondary outcome while the title promises the primary one.
8. Cluster design powered with an individual-level formula (no design effect).
9. Δ chosen because it makes n small, not because it is the minimum clinically important
   difference. Ask for the clinical justification.
10. Feasibility ignored — the calculated n exceeds the number of eligible patients the
    centre actually sees in the study period. Check n against the stated caseload and
    say so when they do not reconcile.
