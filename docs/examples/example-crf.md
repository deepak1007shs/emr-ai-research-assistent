# DATA COLLECTION PLAN

*Built before any form field exists. Rows are data elements, columns are the
visits. A tick means collect it here; an empty cell means do not. This grid is
the blueprint the case report form is expanded from.*

**Capture pattern:** Prospective, single-arm observational cohort. Baseline
history and investigations abstracted from case files at enrolment; all
intraoperative and postoperative data collected prospectively.

| DATA ELEMENT | Baseline (Pre-op) | Intra-op | Day 1-3 | Discharge | 1 Month |
|---|:---:|:---:|:---:|:---:|:---:|
| Demographic details | ✓ | | | | |
| Comorbidity and risk factors | ✓ | | | | |
| Previous abdominal surgery | ✓ | | | | |
| Hernia characteristics (EHS) | ✓ | | | | |
| Defect size measurement | ✓ | | | | |
| ASA physical status | ✓ | | | | |
| Preoperative investigations | ✓ | | | | |
| Screening outcome | ✓ | | | | |
| Operative details | | ✓ | | | |
| Adhesion severity | | ✓ | | | |
| **Conversion, type and reason** | | ✓ | | | |
| Operative duration | | ✓ | | | |
| Intraoperative complications | | ✓ | | | |
| Postoperative pain score | | | ✓ | | |
| Postoperative complications | | | ✓ | ✓ | ✓ |
| Date of discharge | | | | ✓ | |
| Seroma on examination | | | | ✓ | ✓ |
| Recurrence | | | | | ✓ |
| Return to normal activity | | | | | ✓ |
| Study completion status | | | | | ✓ |

## Exposure, outcome and confounder roll-call

*A build-time check. It does not print on the form; it stops the study's own
variables going missing.*

| Role | Variable | Field planned? | Where captured |
|---|---|---|---|
| Exposure | Patient, hernia and operative factors (each listed below) | Yes | Baseline / Intra-op |
| **Primary outcome** | Intraoperative conversion | Yes, Section E item 6 | Intra-op |
| Secondary outcome | Operative duration | Yes, Section E item 10 | Intra-op |
| Secondary outcome | Postoperative length of stay | Derived from two dates | Discharge |
| Secondary outcome | Type and reason for conversion | Yes, Section E items 7 and 8 | Intra-op |
| Confounder | Age | Yes, Section A item 1 | Baseline |
| Confounder | Body mass index | Derived from height and weight | Baseline |
| Confounder | Previous abdominal surgery | Yes, Section B item 5 | Baseline |

## Collected once, collected repeatedly

**Once:** demographics, comorbidity, previous surgery, hernia characteristics,
ASA grade, preoperative investigations, screening outcome, all operative details.

**Repeatedly:** postoperative complications (Day 1-3, discharge, 1 month), seroma
on examination (discharge, 1 month).

---
---

# CASE REPORT FORM (CRF)

**Factors Associated with Intraoperative Conversion during Transabdominal
Preperitoneal (TAPP) Repair of Ventral Hernia - A Prospective Observational
Cohort Study**

*Department of General Surgery, All India Institute of Medical Sciences, Jodhpur*

---

### Form & Subject Identifiers

| # | Field / Variable | Field type | Response |
|---|---|---|---|
| 1 | Study subject ID | Number | \_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_ |
| 2 | CR number | Number | \_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_ |
| 3 | Patient name (initials only) | Text | \_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_ |
| 4 | Date of birth | Date | \_\_\_ / \_\_\_ / \_\_\_\_\_\_ |
| 5 | Date of enrollment | Date | \_\_\_ / \_\_\_ / \_\_\_\_\_\_ |
| 6 | CRF version / date | Text / Date | v1.0  \_\_\_ / \_\_\_ / \_\_\_\_\_\_ |
| 7 | Completed by (initials) | Text | \_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_ |

### Section A - Demographics & Identification

| # | Field / Variable | Field type | Response |
|---|---|---|---|
| 1 | Age | Number | \_\_\_\_\_\_\_\_ years |
| 2 | Sex | Single-select | ☐ Male  ☐ Female |
| 3 | Residence | Single-select | ☐ Rural  ☐ Urban |
| 4 | Height | Number | \_\_\_\_\_\_\_\_ cm |
| 5 | Weight | Number | \_\_\_\_\_\_\_\_ kg |
| 6 | Screening outcome | Single-select | ☐ Enrolled  ☐ Ineligible  ☐ Declined  ☐ Other |

*Body mass index is calculated from height and weight. Do not enter it here.*

### Section B - Comorbidity & Surgical History

| # | Field / Variable | Field type | Response |
|---|---|---|---|
| 1 | Diabetes mellitus | Single-select | ☐ Yes  ☐ No |
| 2 | Hypertension | Single-select | ☐ Yes  ☐ No |
| 3 | Chronic obstructive pulmonary disease | Single-select | ☐ Yes  ☐ No |
| 4 | Smoking status | Single-select | ☐ Current  ☐ Former  ☐ Never |
| 5 | Previous abdominal surgery | Single-select | ☐ Yes  ☐ No |
| 6 | If yes, number of previous operations | Number | \_\_\_\_\_\_\_\_ |
| 7 | ASA physical status | Single-select | ☐ I  ☐ II  ☐ III |

### Section C - Hernia Characteristics

| # | Field / Variable | Field type | Response |
|---|---|---|---|
| 1 | Hernia type | Single-select | ☐ Primary  ☐ Incisional  ☐ Recurrent  ☐ Lumbar |
| 2 | Defect location (EHS) | Single-select | ☐ Midline  ☐ Lateral |
| 3 | Defect width (longest transverse) | Number | \_\_\_\_\_\_\_\_ cm |
| 4 | Defect length | Number | \_\_\_\_\_\_\_\_ cm |
| 5 | Reducibility | Single-select | ☐ Reducible  ☐ Irreducible |

*The EHS width band (W1, W2, W3) is derived from the defect width. Do not enter
it here.*

### Section D - Preoperative Investigations

| # | Field / Variable | Field type | Response |
|---|---|---|---|
| 1 | Haemoglobin | Number | \_\_\_\_\_\_\_\_ g/dL |
| 2 | Serum albumin | Number | \_\_\_\_\_\_\_\_ g/dL |
| 3 | HbA1c (if diabetic) | Number | \_\_\_\_\_\_\_\_ % |
| 4 | CT abdomen performed | Single-select | ☐ Yes  ☐ No |

### Section E - Intraoperative Details

| # | Field / Variable | Field type | Response |
|---|---|---|---|
| 1 | Date of surgery | Date | \_\_\_ / \_\_\_ / \_\_\_\_\_\_ |
| 2 | Operating surgeon grade | Single-select | ☐ Consultant  ☐ Trainee |
| 3 | Adhesion severity (Zuhlke grade) | Single-select | ☐ I  ☐ II  ☐ III  ☐ IV |
| 4 | Mesh used | Single-select | ☐ Yes  ☐ No |
| 5 | Mesh size | Number | \_\_\_\_\_\_\_\_ cm x \_\_\_\_\_\_\_\_ cm |
| **6** | **Conversion to another technique** | **Single-select** | **☐ Yes  ☐ No** |
| 7 | If converted, type of conversion | Single-select | ☐ IPOM  ☐ TARM  ☐ TAR  ☐ Open repair |
| 8 | If converted, reason for conversion | Single-select | ☐ Adhesions  ☐ Bleeding  ☐ Peritoneal tear  ☐ Poor visibility  ☐ Technical difficulty |
| 9 | Time of skin incision | Text | \_\_\_\_ : \_\_\_\_ (24 h) |
| 10 | Time of skin closure | Text | \_\_\_\_ : \_\_\_\_ (24 h) |
| 11 | Intraoperative complication | Single-select | ☐ None  ☐ Bowel injury  ☐ Bleeding  ☐ Other: \_\_\_\_\_\_ |

*Operative duration is calculated from the incision and closure times. Do not
enter it here.*

### Section F - Postoperative Course, Day 1 to 3

| # | Field / Variable | Field type | Response |
|---|---|---|---|
| 1 | Assessment date | Date | \_\_\_ / \_\_\_ / \_\_\_\_\_\_ |
| 2 | Pain score at 24 hours (VAS 0-10) | Number | \_\_\_\_\_\_\_\_ (0 to 10) |
| 3 | Pain score at 48 hours (VAS 0-10) | Number | \_\_\_\_\_\_\_\_ (0 to 10) |
| 4 | Complication present | Single-select | ☐ Yes  ☐ No |
| 5 | If yes, Clavien-Dindo grade | Single-select | ☐ I  ☐ II  ☐ IIIa  ☐ IIIb  ☐ IVa  ☐ IVb  ☐ V |

### Section G - Discharge

| # | Field / Variable | Field type | Response |
|---|---|---|---|
| 1 | Date of discharge | Date | \_\_\_ / \_\_\_ / \_\_\_\_\_\_ |
| 2 | Seroma on examination | Single-select | ☐ Yes  ☐ No |
| 3 | Complication present at discharge | Single-select | ☐ Yes  ☐ No |
| 4 | If yes, Clavien-Dindo grade | Single-select | ☐ I  ☐ II  ☐ IIIa  ☐ IIIb  ☐ IVa  ☐ IVb  ☐ V |

*Postoperative length of stay is calculated from the date of surgery and the date
of discharge. Do not enter it here.*

### Section H - Follow-up at 1 Month

| # | Field / Variable | Field type | Response |
|---|---|---|---|
| 1 | Date of visit | Date | \_\_\_ / \_\_\_ / \_\_\_\_\_\_ |
| 2 | Attended follow-up | Single-select | ☐ Yes  ☐ No |
| 3 | Seroma on examination | Single-select | ☐ Yes  ☐ No |
| 4 | Recurrence detected | Single-select | ☐ Yes  ☐ No |
| 5 | Complication present | Single-select | ☐ Yes  ☐ No |
| 6 | If yes, Clavien-Dindo grade | Single-select | ☐ I  ☐ II  ☐ IIIa  ☐ IIIb  ☐ IVa  ☐ IVb  ☐ V |
| 7 | Date of return to normal activity | Date | \_\_\_ / \_\_\_ / \_\_\_\_\_\_ |

### Section I - Study Completion

| # | Field / Variable | Field type | Response |
|---|---|---|---|
| 1 | Completed the study | Single-select | ☐ Yes  ☐ No |
| 2 | Withdrawal or loss to follow-up | Single-select | ☐ Yes  ☐ No |
| 3 | Reason for withdrawal or loss | Text | \_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_ |

### Investigator Sign-off

| # | Field / Variable | Field type | Response |
|---|---|---|---|
| 1 | Data collected by (name) | Text | \_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_ |
| 2 | Data verified by (name) | Text | \_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_ |
| 3 | Date | Date | \_\_\_ / \_\_\_ / \_\_\_\_\_\_ |

---

### Values calculated from this form, not collected on it

| Value | Calculated from | How |
|---|---|---|
| Body mass index | Height; Weight | Weight in kg divided by height in metres squared |
| EHS width band | Defect width | W1 under 4 cm; W2 4 to 10 cm; W3 over 10 cm |
| Operative duration | Time of incision; Time of closure | Closure time minus incision time, in minutes |
| Postoperative length of stay | Date of surgery; Date of discharge | Discharge date minus surgery date, in whole days |
| Time to return to normal activity | Date of surgery; Date of return | Return date minus surgery date, in days |

*Do not record these here. A computed value entered by hand cannot be audited, and
the raw data is what lets an error be corrected later.*
