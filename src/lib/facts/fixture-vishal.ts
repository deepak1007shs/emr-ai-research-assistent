import type { FactsSheet } from "../study/types.ts";

/**
 * A real protocol's reading, kept as the second fixture.
 *
 * IDA-PREG is a two-arm randomised trial, and every rule in this build was
 * written against it. This one is what a trial fixture cannot be: an
 * observational cohort whose factors are variables rather than arms, with a
 * secondary objective that asks how well four measurements predict the outcome,
 * an ordinal complication grade, and a quality-of-life outcome named only in
 * the methods.
 *
 * The reading is the model's own, word for word, from the stored plan. What is
 * added by hand is each outcome's `kind` and its `exposures`, because the
 * schema had no field for either when this protocol was read. That is what
 * makes this file an oracle rather than a record: it says what a correct
 * reading says, and the plan built from it is compared against the analysis
 * plan written for this study by hand.
 *
 * Its analysis plan is pinned in `sap/vishal.test.ts`.
 */
export const vishal: FactsSheet = {
  "aim": "To determine the various factors affecting the amputation rates among the patients presenting with extremity vascular trauma",
  "frame": "PECO",
  "title": "FACTORS AFFECTING THE RATES OF AMPUTATIONS AMONG THE PATIENTS SUSTAINING VASCULAR TRAUMA TO THE EXTREMITIES",
  "design": "cohort",
  "groups": [],
  "primary": {
    "how": "Recorded as yes/no from the operative record and from the day 3 and day 30 follow-up assessments; both amputation performed at the index operation and amputation performed later within 30 days are counted. Level of amputation recorded where amputation is done.",
    "time": [
      "POSTOP",
      "D3",
      "D30"
    ],
    "type": "binary",
    "unit": "Yes / No",
    "what": "Amputation (primary or secondary) of the injured extremity within 30 days of injury",
    "measures": [
      "amputation"
    ],
    "instrument": "Clinical and operative assessment documented on the study proforma; follow-up by inpatient evaluation or outpatient/telephonic contact",
    "distribution": "unknown",
    "competing_event": null,
    "expected_frequency": 0.15,
    "kind": "association",
    "exposures": [
      {
        "measure": "ischemia_duration",
        "at": "INTRAOP",
        "reference": ""
      },
      {
        "measure": "mechanism_of_injury",
        "at": "D0",
        "reference": "Blunt"
      },
      {
        "measure": "level_of_vascular_injury",
        "at": "D0",
        "reference": ""
      }
    ],
    "covariates": [
      {
        "measure": "age",
        "at": "D0",
        "inferred": false
      },
      {
        "measure": "sex",
        "at": "D0",
        "inferred": false
      },
      {
        "measure": "shock_at_presentation",
        "at": "D0",
        "inferred": false
      },
      {
        "measure": "serum_lactate",
        "at": "D0",
        "inferred": false
      }
    ]
  },
  "measures": [
    {
      "name": "participant_name",
      "type": "text",
      "unit": null,
      "block": null,
      "label": "Name",
      "recipe": null,
      "options": null,
      "derived_from": []
    },
    {
      "name": "cr_number",
      "type": "text",
      "unit": null,
      "block": null,
      "label": "CR number",
      "recipe": null,
      "options": null,
      "derived_from": []
    },
    {
      "name": "mobile_number",
      "type": "text",
      "unit": null,
      "block": null,
      "label": "Mobile number",
      "recipe": null,
      "options": null,
      "derived_from": []
    },
    {
      "name": "date_of_admission",
      "type": "date",
      "unit": null,
      "block": null,
      "label": "Date of admission",
      "recipe": null,
      "options": null,
      "derived_from": []
    },
    {
      "name": "date_of_surgery",
      "type": "date",
      "unit": null,
      "block": null,
      "label": "Date of surgery",
      "recipe": null,
      "options": null,
      "derived_from": []
    },
    {
      "name": "age",
      "type": "continuous",
      "unit": "years",
      "block": "demographic characteristics",
      "label": "Age",
      "recipe": null,
      "options": null,
      "derived_from": []
    },
    {
      "name": "sex",
      "type": "nominal",
      "unit": null,
      "block": "demographic characteristics",
      "label": "Sex",
      "recipe": null,
      "options": [
        "Male",
        "Female"
      ],
      "derived_from": []
    },
    {
      "name": "education",
      "type": "nominal",
      "unit": null,
      "block": "demographic characteristics",
      "label": "Education",
      "recipe": null,
      "options": null,
      "derived_from": []
    },
    {
      "name": "occupation",
      "type": "text",
      "unit": null,
      "block": "demographic characteristics",
      "label": "Occupation",
      "recipe": null,
      "options": null,
      "derived_from": []
    },
    {
      "name": "marital_status",
      "type": "nominal",
      "unit": null,
      "block": "demographic characteristics",
      "label": "Marital status",
      "recipe": null,
      "options": null,
      "derived_from": []
    },
    {
      "name": "alcohol_intake",
      "type": "binary",
      "unit": null,
      "block": "personal history and substance use",
      "label": "Alcohol intake",
      "recipe": null,
      "options": [
        "Yes",
        "No"
      ],
      "derived_from": []
    },
    {
      "name": "alcohol_duration",
      "type": "continuous",
      "unit": "years",
      "block": "personal history and substance use",
      "label": "Duration of alcohol intake",
      "recipe": null,
      "options": null,
      "derived_from": []
    },
    {
      "name": "alcohol_quantity",
      "type": "continuous",
      "unit": null,
      "block": "personal history and substance use",
      "label": "Quantity of alcohol intake",
      "recipe": null,
      "options": null,
      "derived_from": []
    },
    {
      "name": "smoking",
      "type": "binary",
      "unit": null,
      "block": "personal history and substance use",
      "label": "Smoking",
      "recipe": null,
      "options": [
        "Yes",
        "No"
      ],
      "derived_from": []
    },
    {
      "name": "smoking_duration",
      "type": "continuous",
      "unit": "years",
      "block": "personal history and substance use",
      "label": "Duration of smoking",
      "recipe": null,
      "options": null,
      "derived_from": []
    },
    {
      "name": "smoking_quantity",
      "type": "continuous",
      "unit": null,
      "block": "personal history and substance use",
      "label": "Quantity of smoking",
      "recipe": null,
      "options": null,
      "derived_from": []
    },
    {
      "name": "diabetes_mellitus",
      "type": "binary",
      "unit": null,
      "block": "comorbidities",
      "label": "Diabetes mellitus",
      "recipe": null,
      "options": [
        "Yes",
        "No"
      ],
      "derived_from": []
    },
    {
      "name": "hypertension",
      "type": "binary",
      "unit": null,
      "block": "comorbidities",
      "label": "Hypertension",
      "recipe": null,
      "options": [
        "Yes",
        "No"
      ],
      "derived_from": []
    },
    {
      "name": "hypothyroidism",
      "type": "binary",
      "unit": null,
      "block": "comorbidities",
      "label": "Hypothyroidism",
      "recipe": null,
      "options": [
        "Yes",
        "No"
      ],
      "derived_from": []
    },
    {
      "name": "coronary_artery_disease",
      "type": "binary",
      "unit": null,
      "block": "comorbidities",
      "label": "Coronary artery disease",
      "recipe": null,
      "options": [
        "Yes",
        "No"
      ],
      "derived_from": []
    },
    {
      "name": "other_comorbidity",
      "type": "text",
      "unit": null,
      "block": "comorbidities",
      "label": "Other comorbidity",
      "recipe": null,
      "options": null,
      "derived_from": []
    },
    {
      "name": "previous_peripheral_vascular_disease",
      "type": "binary",
      "unit": null,
      "block": null,
      "label": "Previous history of peripheral vascular disease",
      "recipe": null,
      "options": [
        "Yes",
        "No"
      ],
      "derived_from": []
    },
    {
      "name": "height",
      "type": "continuous",
      "unit": "cm",
      "block": "clinical parameters at presentation",
      "label": "Height",
      "recipe": null,
      "options": null,
      "derived_from": []
    },
    {
      "name": "weight",
      "type": "continuous",
      "unit": "kg",
      "block": "clinical parameters at presentation",
      "label": "Weight",
      "recipe": null,
      "options": null,
      "derived_from": []
    },
    {
      "name": "body_mass_index",
      "type": "continuous",
      "unit": "kg/m2",
      "block": "clinical parameters at presentation",
      "label": "Body mass index",
      "recipe": "Weight in kilograms divided by the square of height in metres",
      "options": null,
      "derived_from": [
        "height",
        "weight"
      ]
    },
    {
      "name": "temperature",
      "type": "continuous",
      "unit": "degrees Celsius",
      "block": "clinical parameters at presentation",
      "label": "Temperature",
      "recipe": null,
      "options": null,
      "derived_from": []
    },
    {
      "name": "pulse_rate",
      "type": "continuous",
      "unit": "beats per minute",
      "block": "clinical parameters at presentation",
      "label": "Pulse rate",
      "recipe": null,
      "options": null,
      "derived_from": []
    },
    {
      "name": "respiratory_rate",
      "type": "continuous",
      "unit": "breaths per minute",
      "block": "clinical parameters at presentation",
      "label": "Respiratory rate",
      "recipe": null,
      "options": null,
      "derived_from": []
    },
    {
      "name": "systolic_blood_pressure",
      "type": "continuous",
      "unit": "mmHg",
      "block": "clinical parameters at presentation",
      "label": "Systolic blood pressure",
      "recipe": null,
      "options": null,
      "derived_from": []
    },
    {
      "name": "diastolic_blood_pressure",
      "type": "continuous",
      "unit": "mmHg",
      "block": "clinical parameters at presentation",
      "label": "Diastolic blood pressure",
      "recipe": null,
      "options": null,
      "derived_from": []
    },
    {
      "name": "glasgow_coma_scale",
      "type": "ordinal",
      "unit": null,
      "block": "clinical parameters at presentation",
      "label": "Glasgow Coma Scale",
      "recipe": null,
      "options": [
        "3",
        "4",
        "5",
        "6",
        "7",
        "8",
        "9",
        "10",
        "11",
        "12",
        "13",
        "14",
        "15"
      ],
      "derived_from": []
    },
    {
      "name": "shock_at_presentation",
      "type": "binary",
      "unit": null,
      "block": "clinical parameters at presentation",
      "label": "Shock at presentation",
      "recipe": null,
      "options": [
        "Yes",
        "No"
      ],
      "derived_from": []
    },
    {
      "name": "time_of_injury",
      "type": "date",
      "unit": null,
      "block": "injury characteristics",
      "label": "Time of injury",
      "recipe": null,
      "options": null,
      "derived_from": []
    },
    {
      "name": "mechanism_of_injury",
      "type": "nominal",
      "unit": null,
      "block": "injury characteristics",
      "label": "Mechanism of injury",
      "recipe": null,
      "options": [
        "Blunt",
        "Penetrating"
      ],
      "derived_from": []
    },
    {
      "name": "referral_hospital_treatment",
      "type": "text",
      "unit": null,
      "block": "injury characteristics",
      "label": "Referral hospital and treatment done",
      "recipe": null,
      "options": null,
      "derived_from": []
    },
    {
      "name": "injured_limb_region",
      "type": "nominal",
      "unit": null,
      "block": "injury characteristics",
      "label": "Injured limb",
      "recipe": null,
      "options": [
        "Upper limb",
        "Lower limb"
      ],
      "derived_from": []
    },
    {
      "name": "pin_prick_sensation",
      "type": "nominal",
      "unit": null,
      "block": "injury characteristics",
      "label": "Pin prick sensation in the injured limb",
      "recipe": null,
      "options": [
        "Present",
        "Absent"
      ],
      "derived_from": []
    },
    {
      "name": "nerve_injury",
      "type": "binary",
      "unit": null,
      "block": "injury characteristics",
      "label": "Associated nerve injury",
      "recipe": null,
      "options": [
        "Yes",
        "No"
      ],
      "derived_from": []
    },
    {
      "name": "associated_fractures",
      "type": "binary",
      "unit": null,
      "block": "injury characteristics",
      "label": "Associated fractures",
      "recipe": null,
      "options": [
        "Yes",
        "No"
      ],
      "derived_from": []
    },
    {
      "name": "associated_injuries",
      "type": "text",
      "unit": null,
      "block": "injury characteristics",
      "label": "Other associated injuries (secondary survey findings)",
      "recipe": null,
      "options": null,
      "derived_from": []
    },
    {
      "name": "level_of_vascular_injury",
      "type": "nominal",
      "unit": null,
      "block": "injury characteristics",
      "label": "Anatomical level of vascular injury",
      "recipe": null,
      "options": null,
      "derived_from": []
    },
    {
      "name": "peripheral_arterial_pulse_status",
      "type": "nominal",
      "unit": null,
      "block": null,
      "label": "Peripheral arterial pulse (carotid, brachial, radial, ulnar, femoral, popliteal, anterior tibial, posterior tibial, dorsalis pedis; left and right)",
      "recipe": null,
      "options": [
        "Present",
        "Absent"
      ],
      "derived_from": []
    },
    {
      "name": "mess_skeletal_soft_tissue_score",
      "type": "count",
      "unit": "points",
      "block": "injury severity scores",
      "label": "MESS – skeletal and soft tissue injury component",
      "recipe": null,
      "options": null,
      "derived_from": []
    },
    {
      "name": "mess_ischemia_score",
      "type": "count",
      "unit": "points",
      "block": "injury severity scores",
      "label": "MESS – limb ischaemia component",
      "recipe": null,
      "options": null,
      "derived_from": []
    },
    {
      "name": "mess_shock_score",
      "type": "count",
      "unit": "points",
      "block": "injury severity scores",
      "label": "MESS – shock component",
      "recipe": null,
      "options": null,
      "derived_from": []
    },
    {
      "name": "mess_age_score",
      "type": "count",
      "unit": "points",
      "block": "injury severity scores",
      "label": "MESS – age component",
      "recipe": null,
      "options": null,
      "derived_from": []
    },
    {
      "name": "mess_total_score",
      "type": "count",
      "unit": "points",
      "block": "injury severity scores",
      "label": "Mangled Extremity Severity Score (total)",
      "recipe": "Sum of the four MESS component scores",
      "options": null,
      "derived_from": [
        "mess_skeletal_soft_tissue_score",
        "mess_ischemia_score",
        "mess_shock_score",
        "mess_age_score"
      ]
    },
    {
      "name": "ganga_skin_fascia_score",
      "type": "count",
      "unit": "points",
      "block": "injury severity scores",
      "label": "Ganga score – skin and fascia involvement",
      "recipe": null,
      "options": null,
      "derived_from": []
    },
    {
      "name": "ganga_bone_joint_score",
      "type": "count",
      "unit": "points",
      "block": "injury severity scores",
      "label": "Ganga score – bone and joint involvement",
      "recipe": null,
      "options": null,
      "derived_from": []
    },
    {
      "name": "ganga_muscle_nerve_score",
      "type": "count",
      "unit": "points",
      "block": "injury severity scores",
      "label": "Ganga score – muscle and nerve involvement",
      "recipe": null,
      "options": null,
      "derived_from": []
    },
    {
      "name": "ganga_comorbidity_score",
      "type": "count",
      "unit": "points",
      "block": "injury severity scores",
      "label": "Ganga score – comorbidity component",
      "recipe": null,
      "options": null,
      "derived_from": []
    },
    {
      "name": "ganga_total_score",
      "type": "count",
      "unit": "points",
      "block": "injury severity scores",
      "label": "Ganga Hospital Open Injury Score (total)",
      "recipe": "Sum of the Ganga score component scores",
      "options": null,
      "derived_from": [
        "ganga_skin_fascia_score",
        "ganga_bone_joint_score",
        "ganga_muscle_nerve_score",
        "ganga_comorbidity_score"
      ]
    },
    {
      "name": "radiograph_findings",
      "type": "text",
      "unit": null,
      "block": "imaging findings",
      "label": "Radiograph findings (chest, skull, upper limb, pelvis, lower limb)",
      "recipe": null,
      "options": null,
      "derived_from": []
    },
    {
      "name": "usg_efast",
      "type": "text",
      "unit": null,
      "block": "imaging findings",
      "label": "USG e-FAST findings",
      "recipe": null,
      "options": null,
      "derived_from": []
    },
    {
      "name": "usg_arterial_doppler",
      "type": "text",
      "unit": null,
      "block": "imaging findings",
      "label": "USG arterial Doppler of the affected limb",
      "recipe": null,
      "options": null,
      "derived_from": []
    },
    {
      "name": "ct_angiography",
      "type": "text",
      "unit": null,
      "block": "imaging findings",
      "label": "CT angiography of the involved limb",
      "recipe": null,
      "options": null,
      "derived_from": []
    },
    {
      "name": "ncct_head_cspine",
      "type": "text",
      "unit": null,
      "block": "imaging findings",
      "label": "NCCT head and C-spine findings",
      "recipe": null,
      "options": null,
      "derived_from": []
    },
    {
      "name": "haemoglobin",
      "type": "continuous",
      "unit": "g/dL",
      "block": "laboratory parameters at presentation",
      "label": "Haemoglobin",
      "recipe": null,
      "options": null,
      "derived_from": []
    },
    {
      "name": "total_leukocyte_count",
      "type": "continuous",
      "unit": "cells/mm3",
      "block": "laboratory parameters at presentation",
      "label": "Total leukocyte count",
      "recipe": null,
      "options": null,
      "derived_from": []
    },
    {
      "name": "platelet_count",
      "type": "continuous",
      "unit": "cells/mm3",
      "block": "laboratory parameters at presentation",
      "label": "Platelet count",
      "recipe": null,
      "options": null,
      "derived_from": []
    },
    {
      "name": "serum_creatinine",
      "type": "continuous",
      "unit": "mg/dL",
      "block": "laboratory parameters at presentation",
      "label": "Serum creatinine",
      "recipe": null,
      "options": null,
      "derived_from": []
    },
    {
      "name": "inr",
      "type": "continuous",
      "unit": "ratio",
      "block": "laboratory parameters at presentation",
      "label": "International normalized ratio",
      "recipe": null,
      "options": null,
      "derived_from": []
    },
    {
      "name": "arterial_ph",
      "type": "continuous",
      "unit": null,
      "block": "laboratory parameters at presentation",
      "label": "Arterial pH",
      "recipe": null,
      "options": null,
      "derived_from": []
    },
    {
      "name": "serum_bicarbonate",
      "type": "continuous",
      "unit": "mmol/L",
      "block": "laboratory parameters at presentation",
      "label": "Serum bicarbonate (HCO3)",
      "recipe": null,
      "options": null,
      "derived_from": []
    },
    {
      "name": "base_excess",
      "type": "continuous",
      "unit": "mmol/L",
      "block": "laboratory parameters at presentation",
      "label": "Base excess",
      "recipe": null,
      "options": null,
      "derived_from": []
    },
    {
      "name": "serum_lactate",
      "type": "continuous",
      "unit": "mmol/L",
      "block": "laboratory parameters at presentation",
      "label": "Serum lactate",
      "recipe": null,
      "options": null,
      "derived_from": []
    },
    {
      "name": "time_of_revascularization",
      "type": "date",
      "unit": null,
      "block": "operative and intraoperative findings",
      "label": "Time of revascularization",
      "recipe": null,
      "options": null,
      "derived_from": []
    },
    {
      "name": "ischemia_duration",
      "type": "continuous",
      "unit": "hours",
      "block": "operative and intraoperative findings",
      "label": "Duration of ischaemia (injury to revascularization)",
      "recipe": "Time of revascularization minus time of injury, expressed in hours",
      "options": null,
      "derived_from": [
        "time_of_injury",
        "time_of_revascularization"
      ]
    },
    {
      "name": "intraoperative_blood_loss",
      "type": "continuous",
      "unit": "mL",
      "block": "operative and intraoperative findings",
      "label": "Amount of intraoperative blood loss",
      "recipe": null,
      "options": null,
      "derived_from": []
    },
    {
      "name": "duration_of_surgery",
      "type": "continuous",
      "unit": "minutes",
      "block": "operative and intraoperative findings",
      "label": "Duration of surgery",
      "recipe": null,
      "options": null,
      "derived_from": []
    },
    {
      "name": "proximal_artery_status",
      "type": "text",
      "unit": null,
      "block": "operative and intraoperative findings",
      "label": "Status of affected artery – proximal part",
      "recipe": null,
      "options": null,
      "derived_from": []
    },
    {
      "name": "distal_artery_status",
      "type": "text",
      "unit": null,
      "block": "operative and intraoperative findings",
      "label": "Status of affected artery – distal part",
      "recipe": null,
      "options": null,
      "derived_from": []
    },
    {
      "name": "thrombus_present",
      "type": "nominal",
      "unit": null,
      "block": "operative and intraoperative findings",
      "label": "Thrombus",
      "recipe": null,
      "options": [
        "Present",
        "Absent"
      ],
      "derived_from": []
    },
    {
      "name": "muscle_status",
      "type": "nominal",
      "unit": null,
      "block": "operative and intraoperative findings",
      "label": "Muscle status",
      "recipe": null,
      "options": [
        "Viable",
        "Non-viable"
      ],
      "derived_from": []
    },
    {
      "name": "fasciotomy_done",
      "type": "binary",
      "unit": null,
      "block": "operative and intraoperative findings",
      "label": "Fasciotomy",
      "recipe": null,
      "options": [
        "Done",
        "Not done"
      ],
      "derived_from": []
    },
    {
      "name": "muscle_contractility",
      "type": "nominal",
      "unit": null,
      "block": "operative and intraoperative findings",
      "label": "Muscle contractility at fasciotomy",
      "recipe": null,
      "options": [
        "Contractile",
        "Non-contractile"
      ],
      "derived_from": []
    },
    {
      "name": "iv_fluids_volume",
      "type": "continuous",
      "unit": "mL",
      "block": "operative and intraoperative findings",
      "label": "Total volume of IV fluids given",
      "recipe": null,
      "options": null,
      "derived_from": []
    },
    {
      "name": "blood_products_transfused_volume",
      "type": "continuous",
      "unit": "mL",
      "block": "operative and intraoperative findings",
      "label": "Total volume of blood and blood products transfused",
      "recipe": null,
      "options": null,
      "derived_from": []
    },
    {
      "name": "thrombectomy_done",
      "type": "binary",
      "unit": null,
      "block": "operative and intraoperative findings",
      "label": "Thrombectomy",
      "recipe": null,
      "options": [
        "Yes",
        "No"
      ],
      "derived_from": []
    },
    {
      "name": "amputation",
      "type": "binary",
      "unit": null,
      "block": null,
      "label": "Amputation (primary or secondary)",
      "recipe": null,
      "options": [
        "Yes",
        "No"
      ],
      "derived_from": []
    },
    {
      "name": "level_of_amputation",
      "type": "nominal",
      "unit": null,
      "block": null,
      "label": "Level of amputation",
      "recipe": null,
      "options": null,
      "derived_from": []
    },
    {
      "name": "limb_salvage",
      "type": "binary",
      "unit": null,
      "block": null,
      "label": "Status of affected limb (limb salvage)",
      "recipe": null,
      "options": [
        "Salvaged",
        "Amputated"
      ],
      "derived_from": []
    },
    {
      "name": "revision_amputation",
      "type": "binary",
      "unit": null,
      "block": null,
      "label": "Revision amputation",
      "recipe": null,
      "options": [
        "Done",
        "Not done"
      ],
      "derived_from": []
    },
    {
      "name": "distal_stump_status",
      "type": "nominal",
      "unit": null,
      "block": null,
      "label": "Status of distal stump",
      "recipe": null,
      "options": [
        "Healthy",
        "Necrotic"
      ],
      "derived_from": []
    },
    {
      "name": "distal_extremity_status_after_thrombectomy",
      "type": "text",
      "unit": null,
      "block": null,
      "label": "Status of distal extremity after thrombectomy",
      "recipe": null,
      "options": null,
      "derived_from": []
    },
    {
      "name": "postoperative_complications",
      "type": "text",
      "unit": null,
      "block": null,
      "label": "Post-operative complications / other events after surgery",
      "recipe": null,
      "options": null,
      "derived_from": []
    },
    {
      "name": "whoqol_bref_score",
      "type": "continuous",
      "unit": "score",
      "block": null,
      "label": "WHOQOL-BREF quality of life score",
      "recipe": null,
      "options": null,
      "derived_from": []
    }
  ],
  "proforma": [
    {
      "item": "Name",
      "keep": true,
      "reason": "Identifies the record and permits follow-up; not analysed",
      "measure": "participant_name",
      "purpose": "administrative"
    },
    {
      "item": "Age",
      "keep": true,
      "reason": "Named independent variable and baseline descriptor",
      "measure": "age",
      "purpose": "descriptor"
    },
    {
      "item": "Sex",
      "keep": true,
      "reason": "Named independent variable and baseline descriptor",
      "measure": "sex",
      "purpose": "descriptor"
    },
    {
      "item": "CR No",
      "keep": true,
      "reason": "Record identifier for data linkage",
      "measure": "cr_number",
      "purpose": "administrative"
    },
    {
      "item": "Mobile number",
      "keep": true,
      "reason": "Required for telephonic follow-up at day 3 and day 30",
      "measure": "mobile_number",
      "purpose": "administrative"
    },
    {
      "item": "Address",
      "keep": false,
      "reason": "Serves no objective; follow-up is by telephone or clinic visit",
      "measure": null,
      "purpose": null
    },
    {
      "item": "Date of admission",
      "keep": true,
      "reason": "Anchors the follow-up windows",
      "measure": "date_of_admission",
      "purpose": "administrative"
    },
    {
      "item": "Date of surgery",
      "keep": true,
      "reason": "Anchors the operative and post-operative assessments",
      "measure": "date_of_surgery",
      "purpose": "administrative"
    },
    {
      "item": "Education",
      "keep": true,
      "reason": "Socio-demographic descriptor of the trauma population",
      "measure": "education",
      "purpose": "descriptor"
    },
    {
      "item": "Occupation",
      "keep": true,
      "reason": "Descriptor relevant to occupational mechanism of injury",
      "measure": "occupation",
      "purpose": "descriptor"
    },
    {
      "item": "Marital status",
      "keep": true,
      "reason": "Socio-demographic descriptor, relevant context for the quality-of-life outcome",
      "measure": "marital_status",
      "purpose": "descriptor"
    },
    {
      "item": "Alcohol intake: yes/no",
      "keep": true,
      "reason": "Baseline personal-history descriptor",
      "measure": "alcohol_intake",
      "purpose": "descriptor"
    },
    {
      "item": "Alcohol intake – duration",
      "keep": true,
      "reason": "Quantifies the alcohol exposure descriptor",
      "measure": "alcohol_duration",
      "purpose": "descriptor"
    },
    {
      "item": "Alcohol intake – quantity",
      "keep": true,
      "reason": "Quantifies the alcohol exposure descriptor",
      "measure": "alcohol_quantity",
      "purpose": "descriptor"
    },
    {
      "item": "Smoking: yes/no",
      "keep": true,
      "reason": "Named in the introduction as a patient-related factor impairing wound healing; kept as a confounder",
      "measure": "smoking",
      "purpose": "descriptor"
    },
    {
      "item": "Smoking – duration",
      "keep": true,
      "reason": "Quantifies the smoking exposure",
      "measure": "smoking_duration",
      "purpose": "descriptor"
    },
    {
      "item": "Smoking – quantity",
      "keep": true,
      "reason": "Quantifies the smoking exposure",
      "measure": "smoking_quantity",
      "purpose": "descriptor"
    },
    {
      "item": "Menarche at",
      "keep": false,
      "reason": "Serves no objective in a trauma amputation study",
      "measure": null,
      "purpose": null
    },
    {
      "item": "Menopause at",
      "keep": false,
      "reason": "Serves no objective in a trauma amputation study",
      "measure": null,
      "purpose": null
    },
    {
      "item": "Obstetric history",
      "keep": false,
      "reason": "Serves no objective in a trauma amputation study",
      "measure": null,
      "purpose": null
    },
    {
      "item": "Diabetes: yes/no",
      "keep": true,
      "reason": "Named in the introduction as a determinant of failed limb salvage; confounder",
      "measure": "diabetes_mellitus",
      "purpose": "descriptor"
    },
    {
      "item": "Hypertension: yes/no",
      "keep": true,
      "reason": "Comorbidity descriptor",
      "measure": "hypertension",
      "purpose": "descriptor"
    },
    {
      "item": "Hypothyroidism: yes/no",
      "keep": true,
      "reason": "Comorbidity descriptor",
      "measure": "hypothyroidism",
      "purpose": "descriptor"
    },
    {
      "item": "Coronary artery disease: yes/no",
      "keep": true,
      "reason": "Comorbidity descriptor and component of the Ganga score",
      "measure": "coronary_artery_disease",
      "purpose": "descriptor"
    },
    {
      "item": "Other comorbidity",
      "keep": true,
      "reason": "Completes the comorbidity table",
      "measure": "other_comorbidity",
      "purpose": "descriptor"
    },
    {
      "item": "Previous hospitalization",
      "keep": false,
      "reason": "Serves no objective",
      "measure": null,
      "purpose": null
    },
    {
      "item": "History of blood transfusion",
      "keep": false,
      "reason": "Serves no objective; transfusion during this admission is captured separately",
      "measure": null,
      "purpose": null
    },
    {
      "item": "Drug allergies",
      "keep": false,
      "reason": "Clinical safety item; serves no objective",
      "measure": null,
      "purpose": null
    },
    {
      "item": "Built",
      "keep": false,
      "reason": "Serves no objective; BMI is recorded",
      "measure": null,
      "purpose": null
    },
    {
      "item": "Pallor / icterus / clubbing / cyanosis / lymphadenopathy / edema",
      "keep": false,
      "reason": "Serves no objective",
      "measure": null,
      "purpose": null
    },
    {
      "item": "Ht.",
      "keep": true,
      "reason": "Raw input to body mass index",
      "measure": "height",
      "purpose": "input"
    },
    {
      "item": "Wt.",
      "keep": true,
      "reason": "Raw input to body mass index",
      "measure": "weight",
      "purpose": "input"
    },
    {
      "item": "BMI",
      "keep": true,
      "reason": "Baseline descriptor",
      "measure": "body_mass_index",
      "purpose": "descriptor"
    },
    {
      "item": "Temperature",
      "keep": true,
      "reason": "Baseline physiological descriptor at presentation",
      "measure": "temperature",
      "purpose": "descriptor"
    },
    {
      "item": "Pulse rate",
      "keep": true,
      "reason": "Haemodynamic descriptor contributing to the assessment of shock",
      "measure": "pulse_rate",
      "purpose": "descriptor"
    },
    {
      "item": "Respiratory rate",
      "keep": true,
      "reason": "Baseline physiological descriptor at presentation",
      "measure": "respiratory_rate",
      "purpose": "descriptor"
    },
    {
      "item": "BP – systolic",
      "keep": true,
      "reason": "Haemodynamic descriptor underlying the shock variable",
      "measure": "systolic_blood_pressure",
      "purpose": "descriptor"
    },
    {
      "item": "BP – diastolic",
      "keep": true,
      "reason": "Haemodynamic descriptor at presentation",
      "measure": "diastolic_blood_pressure",
      "purpose": "descriptor"
    },
    {
      "item": "Systemic examination – CNS",
      "keep": false,
      "reason": "Serves no objective; GCS records neurological status",
      "measure": null,
      "purpose": null
    },
    {
      "item": "Systemic examination – CVS",
      "keep": false,
      "reason": "Serves no objective",
      "measure": null,
      "purpose": null
    },
    {
      "item": "Systemic examination – Respiratory system",
      "keep": false,
      "reason": "Serves no objective",
      "measure": null,
      "purpose": null
    },
    {
      "item": "Systemic examination – Per abdomen",
      "keep": false,
      "reason": "Serves no objective; e-FAST and secondary survey record abdominal injury",
      "measure": null,
      "purpose": null
    },
    {
      "item": "Diagnosis",
      "keep": false,
      "reason": "Duplicates mechanism of injury and level of vascular injury",
      "measure": null,
      "purpose": null
    },
    {
      "item": "Place of injury",
      "keep": false,
      "reason": "Serves no objective",
      "measure": null,
      "purpose": null
    },
    {
      "item": "Time of injury",
      "keep": true,
      "reason": "Raw input to duration of ischaemia, the first objective",
      "measure": "time_of_injury",
      "purpose": "input"
    },
    {
      "item": "Mechanism of injury",
      "keep": true,
      "reason": "Named exposure (objective 2)",
      "measure": "mechanism_of_injury",
      "purpose": "descriptor"
    },
    {
      "item": "Referral hospital and treatment done",
      "keep": true,
      "reason": "Descriptor of the referral pathway, which drives delay to revascularization",
      "measure": "referral_hospital_treatment",
      "purpose": "descriptor"
    },
    {
      "item": "Primary survey – C spine",
      "keep": false,
      "reason": "Serves no objective; NCCT C-spine is recorded",
      "measure": null,
      "purpose": null
    },
    {
      "item": "Primary survey – Airway",
      "keep": false,
      "reason": "Serves no objective",
      "measure": null,
      "purpose": null
    },
    {
      "item": "Primary survey – Breathing",
      "keep": false,
      "reason": "Serves no objective",
      "measure": null,
      "purpose": null
    },
    {
      "item": "Primary survey – Circulation",
      "keep": true,
      "reason": "The only place haemodynamic status at presentation is recorded; shock is a named independent variable (objective 4)",
      "measure": "shock_at_presentation",
      "purpose": "descriptor"
    },
    {
      "item": "Primary survey – GCS",
      "keep": true,
      "reason": "Descriptor of associated head injury severity",
      "measure": "glasgow_coma_scale",
      "purpose": "descriptor"
    },
    {
      "item": "Primary survey – Pupils",
      "keep": false,
      "reason": "Serves no objective; GCS captures neurological status",
      "measure": null,
      "purpose": null
    },
    {
      "item": "Secondary survey – Head",
      "keep": true,
      "reason": "Records associated injuries, a described determinant of outcome",
      "measure": "associated_injuries",
      "purpose": "descriptor"
    },
    {
      "item": "Secondary survey – Face",
      "keep": true,
      "reason": "Records associated injuries",
      "measure": "associated_injuries",
      "purpose": "descriptor"
    },
    {
      "item": "Secondary survey – Neck",
      "keep": true,
      "reason": "Records associated injuries",
      "measure": "associated_injuries",
      "purpose": "descriptor"
    },
    {
      "item": "Secondary survey – Clavicle",
      "keep": true,
      "reason": "Records associated injuries",
      "measure": "associated_injuries",
      "purpose": "descriptor"
    },
    {
      "item": "Secondary survey – Chest",
      "keep": true,
      "reason": "Records associated injuries (rib fractures, pneumothorax)",
      "measure": "associated_injuries",
      "purpose": "descriptor"
    },
    {
      "item": "Secondary survey – Abdomen",
      "keep": true,
      "reason": "Records associated injuries",
      "measure": "associated_injuries",
      "purpose": "descriptor"
    },
    {
      "item": "Secondary survey – Pelvis and perineum",
      "keep": true,
      "reason": "Records associated injuries",
      "measure": "associated_injuries",
      "purpose": "descriptor"
    },
    {
      "item": "Extremities local examination – Upper limb",
      "keep": true,
      "reason": "Establishes which limb is injured, required for the anatomical level objective",
      "measure": "injured_limb_region",
      "purpose": "input"
    },
    {
      "item": "Extremities local examination – Lower limb",
      "keep": true,
      "reason": "Establishes which limb is injured, required for the anatomical level objective",
      "measure": "injured_limb_region",
      "purpose": "input"
    },
    {
      "item": "Extremities local examination – Pin prick",
      "keep": true,
      "reason": "Raw input to the nerve injury variable and to the MESS/Ganga components",
      "measure": "pin_prick_sensation",
      "purpose": "input"
    },
    {
      "item": "Arterial pulses (carotid, brachial, radial, ulnar, femoral, popliteal, anterior tibial, posterior tibial, dorsalis pedis – left and right), present/absent",
      "keep": true,
      "reason": "Absent peripheral arterial pulse is the inclusion criterion and palpable pulses the exclusion criterion; also records post-operative distal perfusion",
      "measure": "peripheral_arterial_pulse_status",
      "purpose": "population"
    },
    {
      "item": "MESS score – skeletal and soft tissue injury",
      "keep": true,
      "reason": "Component input to the MESS total",
      "measure": "mess_skeletal_soft_tissue_score",
      "purpose": "input"
    },
    {
      "item": "MESS score – limb ischemia",
      "keep": true,
      "reason": "Component input to the MESS total",
      "measure": "mess_ischemia_score",
      "purpose": "input"
    },
    {
      "item": "MESS score – shock",
      "keep": true,
      "reason": "Component input to the MESS total and the only graded record of shock",
      "measure": "mess_shock_score",
      "purpose": "input"
    },
    {
      "item": "MESS score – age",
      "keep": true,
      "reason": "Component input to the MESS total",
      "measure": "mess_age_score",
      "purpose": "input"
    },
    {
      "item": "MESS score – total score",
      "keep": true,
      "reason": "Injury severity descriptor, collected for every patient",
      "measure": "mess_total_score",
      "purpose": "descriptor"
    },
    {
      "item": "Ganga score – skin and fascia involvement",
      "keep": true,
      "reason": "Component input to the Ganga total",
      "measure": "ganga_skin_fascia_score",
      "purpose": "input"
    },
    {
      "item": "Ganga score – bone and joints involvement",
      "keep": true,
      "reason": "Component input to the Ganga total",
      "measure": "ganga_bone_joint_score",
      "purpose": "input"
    },
    {
      "item": "Ganga score – muscles and nerve involvement",
      "keep": true,
      "reason": "Component input to the Ganga total",
      "measure": "ganga_muscle_nerve_score",
      "purpose": "input"
    },
    {
      "item": "Ganga score – co morbidities",
      "keep": true,
      "reason": "Component input to the Ganga total",
      "measure": "ganga_comorbidity_score",
      "purpose": "input"
    },
    {
      "item": "Ganga score – total score",
      "keep": true,
      "reason": "Injury severity descriptor, collected for every patient",
      "measure": "ganga_total_score",
      "purpose": "descriptor"
    },
    {
      "item": "X ray – chest",
      "keep": true,
      "reason": "Input to associated fractures and associated injuries",
      "measure": "radiograph_findings",
      "purpose": "input"
    },
    {
      "item": "X ray – skull",
      "keep": true,
      "reason": "Input to associated injuries",
      "measure": "radiograph_findings",
      "purpose": "input"
    },
    {
      "item": "X ray – upper limb",
      "keep": true,
      "reason": "Input to the associated fractures variable",
      "measure": "radiograph_findings",
      "purpose": "input"
    },
    {
      "item": "X ray – pelvis",
      "keep": true,
      "reason": "Input to associated fractures",
      "measure": "radiograph_findings",
      "purpose": "input"
    },
    {
      "item": "X ray – lower limb",
      "keep": true,
      "reason": "Input to the associated fractures variable",
      "measure": "radiograph_findings",
      "purpose": "input"
    },
    {
      "item": "USG e-FAST",
      "keep": true,
      "reason": "Descriptor of associated torso injury in a polytrauma cohort",
      "measure": "usg_efast",
      "purpose": "descriptor"
    },
    {
      "item": "USG arterial Doppler",
      "keep": true,
      "reason": "Input to the anatomical level of vascular injury",
      "measure": "usg_arterial_doppler",
      "purpose": "input"
    },
    {
      "item": "CT angiography",
      "keep": true,
      "reason": "Input to the anatomical level of vascular injury",
      "measure": "ct_angiography",
      "purpose": "input"
    },
    {
      "item": "NCCT head and C-spine (methodology)",
      "keep": true,
      "reason": "Input to the associated head/spine injury descriptor",
      "measure": "ncct_head_cspine",
      "purpose": "input"
    },
    {
      "item": "CECT (whole abdomen) – if done",
      "keep": false,
      "reason": "Recorded only if done; serves no objective",
      "measure": null,
      "purpose": null
    },
    {
      "item": "Other CT scans (if done)",
      "keep": false,
      "reason": "Recorded only if done; serves no objective",
      "measure": null,
      "purpose": null
    },
    {
      "item": "Hb",
      "keep": true,
      "reason": "Haematological descriptor at presentation, relevant to blood loss and transfusion",
      "measure": "haemoglobin",
      "purpose": "descriptor"
    },
    {
      "item": "TLC",
      "keep": true,
      "reason": "Haematological descriptor relevant to infection, a described determinant of limb loss",
      "measure": "total_leukocyte_count",
      "purpose": "descriptor"
    },
    {
      "item": "PLT",
      "keep": true,
      "reason": "Haematological descriptor relevant to coagulopathy and massive transfusion",
      "measure": "platelet_count",
      "purpose": "descriptor"
    },
    {
      "item": "Sodium",
      "keep": false,
      "reason": "Serves no objective",
      "measure": null,
      "purpose": null
    },
    {
      "item": "Potassium",
      "keep": false,
      "reason": "Serves no objective",
      "measure": null,
      "purpose": null
    },
    {
      "item": "Urea",
      "keep": false,
      "reason": "Serves no objective; creatinine is retained for renal function",
      "measure": null,
      "purpose": null
    },
    {
      "item": "Creatinine",
      "keep": true,
      "reason": "Renal dysfunction is a described systemic consequence of prolonged ischaemia",
      "measure": "serum_creatinine",
      "purpose": "descriptor"
    },
    {
      "item": "Bilirubin (T/C)",
      "keep": false,
      "reason": "Serves no objective",
      "measure": null,
      "purpose": null
    },
    {
      "item": "AST/ALT",
      "keep": false,
      "reason": "Serves no objective",
      "measure": null,
      "purpose": null
    },
    {
      "item": "Protein/albumin",
      "keep": false,
      "reason": "Serves no objective",
      "measure": null,
      "purpose": null
    },
    {
      "item": "Amylase/lipase",
      "keep": false,
      "reason": "Serves no objective",
      "measure": null,
      "purpose": null
    },
    {
      "item": "Calcium",
      "keep": false,
      "reason": "Serves no objective",
      "measure": null,
      "purpose": null
    },
    {
      "item": "PT",
      "keep": false,
      "reason": "Serves no objective; INR is retained as the coagulation descriptor",
      "measure": null,
      "purpose": null
    },
    {
      "item": "APTT",
      "keep": false,
      "reason": "Serves no objective",
      "measure": null,
      "purpose": null
    },
    {
      "item": "INR",
      "keep": true,
      "reason": "Coagulopathy descriptor in the massively transfused trauma patient",
      "measure": "inr",
      "purpose": "descriptor"
    },
    {
      "item": "PTI",
      "keep": false,
      "reason": "Serves no objective; duplicates INR",
      "measure": null,
      "purpose": null
    },
    {
      "item": "pH",
      "keep": true,
      "reason": "Marker of metabolic acidosis from hypoperfusion, discussed as an endpoint of resuscitation",
      "measure": "arterial_ph",
      "purpose": "descriptor"
    },
    {
      "item": "PCO2",
      "keep": false,
      "reason": "Serves no objective",
      "measure": null,
      "purpose": null
    },
    {
      "item": "PO2",
      "keep": false,
      "reason": "Serves no objective",
      "measure": null,
      "purpose": null
    },
    {
      "item": "HCO3",
      "keep": true,
      "reason": "Marker of metabolic acidosis from hypoperfusion",
      "measure": "serum_bicarbonate",
      "purpose": "descriptor"
    },
    {
      "item": "BE",
      "keep": true,
      "reason": "Named in the review as a key endpoint of resuscitation and marker of hypoperfusion",
      "measure": "base_excess",
      "purpose": "descriptor"
    },
    {
      "item": "Lactate",
      "keep": true,
      "reason": "Named systemic exposure (objective 4)",
      "measure": "serum_lactate",
      "purpose": "descriptor"
    },
    {
      "item": "SO2",
      "keep": false,
      "reason": "Serves no objective",
      "measure": null,
      "purpose": null
    },
    {
      "item": "Amount of intraoperative blood loss",
      "keep": true,
      "reason": "Operative descriptor relevant to shock and transfusion",
      "measure": "intraoperative_blood_loss",
      "purpose": "descriptor"
    },
    {
      "item": "Duration of surgery",
      "keep": true,
      "reason": "Operative descriptor",
      "measure": "duration_of_surgery",
      "purpose": "descriptor"
    },
    {
      "item": "Status of affected artery – proximal part",
      "keep": true,
      "reason": "Operative description of the vascular injury",
      "measure": "proximal_artery_status",
      "purpose": "descriptor"
    },
    {
      "item": "Status of affected artery – distal part",
      "keep": true,
      "reason": "Operative description of the vascular injury",
      "measure": "distal_artery_status",
      "purpose": "descriptor"
    },
    {
      "item": "Thrombus – present/absent",
      "keep": true,
      "reason": "Operative finding determining thrombectomy",
      "measure": "thrombus_present",
      "purpose": "descriptor"
    },
    {
      "item": "Muscle status – viable/non-viable",
      "keep": true,
      "reason": "Operative determinant of limb salvage",
      "measure": "muscle_status",
      "purpose": "descriptor"
    },
    {
      "item": "Fasciotomy – done/not",
      "keep": true,
      "reason": "Named exposure (objective 5)",
      "measure": "fasciotomy_done",
      "purpose": "descriptor"
    },
    {
      "item": "If fasciotomy done, muscle – contractile/non-contractile",
      "keep": true,
      "reason": "Operative determinant of limb viability",
      "measure": "muscle_contractility",
      "purpose": "descriptor"
    },
    {
      "item": "Total volume of IV fluids given",
      "keep": true,
      "reason": "Resuscitation descriptor",
      "measure": "iv_fluids_volume",
      "purpose": "descriptor"
    },
    {
      "item": "Total volume of blood and blood products transfused",
      "keep": true,
      "reason": "Massive transfusion is named in the introduction as a systemic factor worsening outcome",
      "measure": "blood_products_transfused_volume",
      "purpose": "descriptor"
    },
    {
      "item": "Intraop ABG if available",
      "keep": false,
      "reason": "Recorded only if available; serves no objective and would be missing in many patients",
      "measure": null,
      "purpose": null
    },
    {
      "item": "Post-operative – status of affected limb",
      "keep": true,
      "reason": "Secondary outcome (limb salvageability)",
      "measure": "limb_salvage",
      "purpose": "input"
    },
    {
      "item": "Post-operative – amputation yes/no",
      "keep": true,
      "reason": "Primary outcome",
      "measure": "amputation",
      "purpose": "input"
    },
    {
      "item": "Post-operative – if amputation is done, level of amputation",
      "keep": true,
      "reason": "Describes the primary outcome event",
      "measure": "level_of_amputation",
      "purpose": "descriptor"
    },
    {
      "item": "Post-operative – thrombectomy yes/no",
      "keep": true,
      "reason": "Operative management descriptor",
      "measure": "thrombectomy_done",
      "purpose": "descriptor"
    },
    {
      "item": "Post-operative – if thrombectomy, status of distal pulses (nine arteries, left and right)",
      "keep": true,
      "reason": "Records restoration of distal perfusion after revascularization",
      "measure": "peripheral_arterial_pulse_status",
      "purpose": "descriptor"
    },
    {
      "item": "3 days follow up – status of limb",
      "keep": true,
      "reason": "Secondary outcome at day 3",
      "measure": "limb_salvage",
      "purpose": "input"
    },
    {
      "item": "3 days follow up – if thrombectomy done, status of distal extremity",
      "keep": true,
      "reason": "Records perfusion of the salvaged limb at day 3",
      "measure": "distal_extremity_status_after_thrombectomy",
      "purpose": "descriptor"
    },
    {
      "item": "3 days follow up – revision amputation done/not",
      "keep": true,
      "reason": "Secondary outcome at day 3",
      "measure": "revision_amputation",
      "purpose": "input"
    },
    {
      "item": "3 days follow up – if yes, status of distal stump (healthy/necrotic)",
      "keep": true,
      "reason": "Describes the revision amputation outcome",
      "measure": "distal_stump_status",
      "purpose": "descriptor"
    },
    {
      "item": "3 days follow up – any other events post surgery",
      "keep": true,
      "reason": "Secondary outcome (post-operative complications) at day 3",
      "measure": "postoperative_complications",
      "purpose": "input"
    },
    {
      "item": "30 days follow up – status of limb",
      "keep": true,
      "reason": "Secondary outcome at day 30",
      "measure": "limb_salvage",
      "purpose": "input"
    },
    {
      "item": "30 days follow up – if thrombectomy done, status of distal extremity",
      "keep": true,
      "reason": "Records perfusion of the salvaged limb at day 30",
      "measure": "distal_extremity_status_after_thrombectomy",
      "purpose": "descriptor"
    },
    {
      "item": "30 days follow up – revision amputation done/not",
      "keep": true,
      "reason": "Secondary outcome at day 30",
      "measure": "revision_amputation",
      "purpose": "input"
    },
    {
      "item": "30 days follow up – if yes, status of distal stump (healthy/necrotic)",
      "keep": true,
      "reason": "Describes the revision amputation outcome",
      "measure": "distal_stump_status",
      "purpose": "descriptor"
    },
    {
      "item": "30 days follow up – any other events post surgery",
      "keep": true,
      "reason": "Secondary outcome (post-operative complications) at day 30",
      "measure": "postoperative_complications",
      "purpose": "input"
    },
    {
      "item": "WHOQOL-BREF questionnaire (annexure; 3 months after amputation)",
      "keep": true,
      "reason": "Secondary outcome stated only in the methodology",
      "measure": "whoqol_bref_score",
      "purpose": "input"
    }
  ],
  "guideline": "STROBE",
  "secondary": [
    {
      "what": "Diagnostic accuracy of MESS, GANGA, serum lactate and duration of ischaemia for predicting amputation within 30 days",
      "how": "Each score or measurement compared against amputation within 30 days, by the area under the ROC curve with the cut-off that maximises the Youden index",
      "instrument": "MESS and Ganga Hospital Open Injury Severity Score, laboratory lactate, and the recorded times of injury and revascularisation",
      "time": [
        "D0",
        "D30"
      ],
      "unit": "Yes / No",
      "type": "binary",
      "distribution": "unknown",
      "expected_frequency": 0.15,
      "competing_event": "",
      "kind": "accuracy",
      "exposures": [
        {
          "measure": "mess_total_score",
          "at": "D0",
          "reference": ""
        },
        {
          "measure": "ganga_total_score",
          "at": "D0",
          "reference": ""
        },
        {
          "measure": "serum_lactate",
          "at": "D0",
          "reference": ""
        },
        {
          "measure": "ischemia_duration",
          "at": "INTRAOP",
          "reference": ""
        }
      ],
      "measures": [
        "amputation"
      ],
      "covariates": []
    },
    {
      "how": "Status of the affected limb recorded at the post-operative assessment and at the day 3 and day 30 follow-up visits; the protocol does not give an explicit definition of limb salvageability separate from the absence of amputation",
      "time": [
        "POSTOP",
        "D3",
        "D30"
      ],
      "type": "binary",
      "unit": "Salvaged / Amputated",
      "what": "Limb salvageability (status of the affected limb)",
      "measures": [
        "limb_salvage"
      ],
      "instrument": "Clinical assessment documented on the study proforma",
      "distribution": "unknown",
      "competing_event": null,
      "expected_frequency": null,
      "kind": "association",
      "exposures": [
        {
          "measure": "ischemia_duration",
          "at": "INTRAOP",
          "reference": ""
        },
        {
          "measure": "mechanism_of_injury",
          "at": "D0",
          "reference": "Blunt"
        },
        {
          "measure": "fasciotomy_done",
          "at": "INTRAOP",
          "reference": "Not done"
        },
        {
          "measure": "level_of_vascular_injury",
          "at": "D0",
          "reference": ""
        }
      ],
      "covariates": [
        {
          "measure": "age",
          "at": "D0",
          "inferred": false
        },
        {
          "measure": "sex",
          "at": "D0",
          "inferred": false
        },
        {
          "measure": "shock_at_presentation",
          "at": "D0",
          "inferred": false
        },
        {
          "measure": "serum_lactate",
          "at": "D0",
          "inferred": false
        }
      ]
    },
    {
      "how": "Recorded as done/not done at the day 3 and day 30 follow-up assessments, with the status of the distal stump (healthy/necrotic) where revision is done",
      "time": [
        "D3",
        "D30"
      ],
      "type": "binary",
      "unit": "Done / Not done",
      "what": "Need for revision amputation",
      "measures": [
        "revision_amputation"
      ],
      "instrument": "Clinical and operative assessment documented on the study proforma",
      "distribution": "unknown",
      "competing_event": null,
      "expected_frequency": null,
      "kind": "association",
      "exposures": [
        {
          "measure": "ischemia_duration",
          "at": "INTRAOP",
          "reference": ""
        },
        {
          "measure": "mechanism_of_injury",
          "at": "D0",
          "reference": "Blunt"
        },
        {
          "measure": "fasciotomy_done",
          "at": "INTRAOP",
          "reference": "Not done"
        },
        {
          "measure": "level_of_vascular_injury",
          "at": "D0",
          "reference": ""
        }
      ],
      "covariates": [
        {
          "measure": "age",
          "at": "D0",
          "inferred": false
        },
        {
          "measure": "sex",
          "at": "D0",
          "inferred": false
        },
        {
          "measure": "shock_at_presentation",
          "at": "D0",
          "inferred": false
        },
        {
          "measure": "serum_lactate",
          "at": "D0",
          "inferred": false
        }
      ]
    },
    {
      "how": "Any other events after surgery recorded free-text at the post-operative assessment and at the day 3 and day 30 follow-up; the protocol gives no list or grading of complications",
      "time": [
        "POSTOP",
        "D3",
        "D30"
      ],
      "type": "nominal",
      "unit": "",
      "what": "Post-operative complications",
      "measures": [
        "postoperative_complications"
      ],
      "instrument": "Clinical assessment documented on the study proforma",
      "distribution": "unknown",
      "competing_event": null,
      "expected_frequency": null,
      "kind": "association",
      "exposures": [
        {
          "measure": "amputation",
          "at": "D30",
          "reference": "No"
        }
      ],
      "covariates": [
        {
          "measure": "age",
          "at": "D0",
          "inferred": false
        },
        {
          "measure": "sex",
          "at": "D0",
          "inferred": false
        },
        {
          "measure": "shock_at_presentation",
          "at": "D0",
          "inferred": false
        },
        {
          "measure": "serum_lactate",
          "at": "D0",
          "inferred": false
        }
      ]
    },
    {
      "how": "Quality of life after amputation will be assessed 3 months after amputation using the WHOQOL questionnaire for all patients; the WHOQOL-BREF questionnaire is annexed",
      "time": [
        "M3"
      ],
      "type": "continuous",
      "unit": "score",
      "what": "Quality of life after amputation at 3 months (stated only in the methodology)",
      "measures": [
        "whoqol_bref_score"
      ],
      "instrument": "WHOQOL-BREF questionnaire",
      "distribution": "unknown",
      "competing_event": null,
      "expected_frequency": null,
      "kind": "association",
      "exposures": [
        {
          "measure": "amputation",
          "at": "D30",
          "reference": "No"
        }
      ],
      "covariates": [
        {
          "measure": "age",
          "at": "D0",
          "inferred": false
        },
        {
          "measure": "sex",
          "at": "D0",
          "inferred": false
        },
        {
          "measure": "shock_at_presentation",
          "at": "D0",
          "inferred": false
        },
        {
          "measure": "serum_lactate",
          "at": "D0",
          "inferred": false
        }
      ]
    }
  ],
  "allocation": {
    "block": null,
    "ratio": "",
    "strata": [],
    "matched": null
  },
  "comparator": "Reference levels of the same exposures within the one cohort (for example penetrating rather than blunt mechanism, fasciotomy not done, no shock at presentation, shorter ischaemia time). The protocol does not state cut-offs or reference categories for any of these exposures.",
  "covariates": [
    {
      "at": "D0",
      "measure": "age",
      "inferred": false
    },
    {
      "at": "D0",
      "measure": "sex",
      "inferred": false
    },
    {
      "at": "D0",
      "measure": "mechanism_of_injury",
      "inferred": false
    },
    {
      "at": "INTRAOP",
      "measure": "ischemia_duration",
      "inferred": false
    },
    {
      "at": "D0",
      "measure": "level_of_vascular_injury",
      "inferred": false
    },
    {
      "at": "D0",
      "measure": "associated_fractures",
      "inferred": false
    },
    {
      "at": "D0",
      "measure": "nerve_injury",
      "inferred": false
    },
    {
      "at": "D0",
      "measure": "shock_at_presentation",
      "inferred": false
    },
    {
      "at": "D0",
      "measure": "serum_lactate",
      "inferred": false
    },
    {
      "at": "INTRAOP",
      "measure": "fasciotomy_done",
      "inferred": false
    },
    {
      "at": "D0",
      "measure": "diabetes_mellitus",
      "inferred": true
    },
    {
      "at": "D0",
      "measure": "smoking",
      "inferred": true
    },
    {
      "at": "D0",
      "measure": "injured_limb_region",
      "inferred": true
    }
  ],
  "hypothesis": null,
  "open_items": [
    "Shock at presentation is a named independent variable but is not defined (systolic blood pressure threshold, shock index, ATLS class?) and has no explicit field on the proforma other than the free-text 'Circulation' box and the MESS shock component. Please give the definition and add a field.",
    "Duration of ischaemia: how is it to be categorised for analysis (e.g. ≤6 h vs >6 h) or analysed as a continuous variable? The 'golden period' of 6 hours is discussed in the review but no cut-off is stated in the objectives.",
    "The proforma records date of surgery but not the exact time of revascularization; without it the injury-to-revascularization interval cannot be computed. Please add time of arrival, time of surgery start and time of restoration of flow.",
    "Serum lactate: at what time point is it sampled (admission, post-resuscitation, serial?) and is a threshold (e.g. >2 mmol/L) to be used, or is it analysed continuously?",
    "The categories for 'anatomical level of vascular injury' are not listed (e.g. axillary, brachial, forearm, femoral, popliteal, tibial). Please supply the print order of categories.",
    "'Limb salvageability' is listed as a secondary outcome but not defined. Is it simply the absence of amputation at day 30, or does it include viability and function of the retained limb?",
    "Post-operative complications are recorded only as 'any other events post surgery'. Please supply the list of complications to be captured and a grading system (e.g. Clavien–Dindo) if one is intended.",
    "Quality of life: the methodology says QoL will be assessed 3 months after amputation 'for all patients' — is the WHOQOL-BREF administered to all participants or only to those amputated? A 3-month visit does not appear in the follow-up schedule (day 3 and day 30 only). Which WHOQOL version, which domains and which scoring algorithm are to be used, and in which language?",
    "The outcome section says amputation 'within 30 days of injury' while the study variables section says amputation 'within 3/30 days'. Please confirm the primary outcome window and whether the day 3 status is a separate outcome.",
    "Does revision amputation within 30 days also count towards the primary outcome, or only the first amputation?",
    "Please define 'primary' versus 'secondary' amputation (index operation versus delayed).",
    "Unit of analysis: how are patients with more than one injured limb (bilateral or multiple extremity vascular injuries) handled — one row per patient or one row per limb, and which limb defines the outcome?",
    "How are patients who die before day 30 handled: excluded, counted as no amputation, or treated as a competing event? Mortality is not listed as an outcome although the cited literature reports it.",
    "Are patients managed non-operatively (no revascularization surgery) eligible? All intraoperative fields would be missing for them.",
    "Are the mechanism-of-injury categories limited to blunt versus penetrating, or are crush, degloving, blast and iatrogenic injuries to be recorded separately before collapsing?",
    "How are 'associated fractures' and 'nerve injury' ascertained and defined (clinical, radiological or intraoperative), and are fractures to be graded (e.g. Gustilo–Anderson)?",
    "Injury Severity Score is repeatedly cited in the review of literature as an independent predictor of limb loss but is not collected on the proforma. Should ISS (and the AIS components needed for it) be added?",
    "Categories for education and marital status are not specified; please supply the response options in print order.",
    "Units for alcohol and smoking quantity are not specified (units per week? cigarettes per day? pack-years?).",
    "Laboratory units and reference ranges are not specified in the proforma; please confirm the units to be used for haemoglobin, TLC, platelets, creatinine, lactate and base excess.",
    "No exposure grouping is pre-specified. For descriptive tables, should the cohort be split by amputation versus limb salvage, and should any exposure (e.g. blunt versus penetrating) also be tabulated as a grouping?",
    "The sample size uses a single-proportion precision formula (n = 100 + 10% = 110) which answers only 'what is the amputation rate ± 7%'. With an expected 15% amputation rate this yields roughly 16 events for the ten candidate predictors listed, far fewer than the 10 events per variable needed for the planned multivariable logistic regression. Please confirm the target: precision of the rate, or power for the stated associations.",
    "No rule is stated for missing data or for loss to follow-up at day 3 and day 30 (including patients followed by telephone only).",
    "The sidedness of significance tests is not stated (two-sided assumed unless specified).",
    "The SPSS version (and Excel version) is not stated.",
    "No interim analysis rule is stated; confirm none is planned.",
    "Confirm that per-patient follow-up is 30 days (plus the 3-month quality-of-life assessment), since the participant information sheet states a participation duration of 18 months.",
    "How is the exclusion criterion 'previous history of peripheral vascular disease' ascertained and recorded (history only, or prior imaging/ABI)? There is no proforma field for it.",
    "Will consecutive screening be logged (number screened, excluded and reasons) so that a STROBE flow diagram can be drawn?"
  ],
  "population": {
    "short": "adults with extremity vascular trauma and absent peripheral pulses",
    "setting": "Department of General Surgery, Advanced Trauma Centre, Post Graduate Institute of Medical Education and Research (PGIMER), Chandigarh",
    "sampling": "All eligible patients who meet the criteria of traumatic vascular injury to the extremities and present to the Advanced Trauma Centre during the study period (July 2026 to December 2027) will be included; that is, consecutive enrolment of presenting patients (a non-probability convenience/consecutive sample). The protocol does not state a screening log.",
    "eligibility": "INCLUSION CRITERIA: All patients with absent peripheral arterial pulse following extremity trauma; Age group: 18 years to 70 years. EXCLUSION CRITERIA: Patient with previous history of peripheral vascular disease; Patients with pulses palpable after extremity trauma."
  },
  "timepoints": [
    "D0",
    "INTRAOP",
    "POSTOP",
    "D3",
    "D30",
    "M3"
  ],
  "sample_size": {
    "verdict": "wrong_formula",
    "attrition": "10% attrition allowed, taking the calculated 100 to a final sample size of 110 patients",
    "per_group": 110,
    "formula_family": "single-proportion absolute-precision formula (n = Z²pq/e², with p = 0.15, q = 0.85, Z = 1.96, e = 0.07)"
  },
  "design_label": "prospective single-centre observational cohort study of consecutive patients with extremity vascular trauma",
  "intervention": "No intervention is assigned; treatment follows ATLS protocol and institutional guidelines with no change in treatment protocol. The observed exposures are: duration of ischaemia (time from injury to revascularization), mechanism of injury (blunt vs penetrating), anatomical level of vascular injury, systemic factors (shock at presentation and serum lactate), and whether fasciotomy was performed.",
  "stated_rules": {
    "alpha": "0.05",
    "sided": null,
    "interim": null,
    "ci_level": "95%",
    "software": "Data entered in Microsoft Excel and analysed using SPSS (version not stated)",
    "missing_data": null
  },
  "question_type": "association",
  "visit_schedule": [
    {
      "label": "Day 0 – presentation to the Advanced Trauma Centre",
      "measures": [
        "participant_name",
        "cr_number",
        "mobile_number",
        "date_of_admission",
        "age",
        "sex",
        "education",
        "occupation",
        "marital_status",
        "alcohol_intake",
        "alcohol_duration",
        "alcohol_quantity",
        "smoking",
        "smoking_duration",
        "smoking_quantity",
        "diabetes_mellitus",
        "hypertension",
        "hypothyroidism",
        "coronary_artery_disease",
        "other_comorbidity",
        "previous_peripheral_vascular_disease",
        "height",
        "weight",
        "body_mass_index",
        "temperature",
        "pulse_rate",
        "respiratory_rate",
        "systolic_blood_pressure",
        "diastolic_blood_pressure",
        "glasgow_coma_scale",
        "shock_at_presentation",
        "time_of_injury",
        "mechanism_of_injury",
        "referral_hospital_treatment",
        "injured_limb_region",
        "pin_prick_sensation",
        "nerve_injury",
        "associated_fractures",
        "associated_injuries",
        "peripheral_arterial_pulse_status",
        "level_of_vascular_injury",
        "mess_skeletal_soft_tissue_score",
        "mess_ischemia_score",
        "mess_shock_score",
        "mess_age_score",
        "mess_total_score",
        "ganga_skin_fascia_score",
        "ganga_bone_joint_score",
        "ganga_muscle_nerve_score",
        "ganga_comorbidity_score",
        "ganga_total_score",
        "radiograph_findings",
        "usg_efast",
        "usg_arterial_doppler",
        "ct_angiography",
        "ncct_head_cspine",
        "haemoglobin",
        "total_leukocyte_count",
        "platelet_count",
        "serum_creatinine",
        "inr",
        "arterial_ph",
        "serum_bicarbonate",
        "base_excess",
        "serum_lactate"
      ],
      "timepoint": "D0"
    },
    {
      "label": "Intraoperative",
      "measures": [
        "date_of_surgery",
        "time_of_revascularization",
        "ischemia_duration",
        "intraoperative_blood_loss",
        "duration_of_surgery",
        "proximal_artery_status",
        "distal_artery_status",
        "thrombus_present",
        "muscle_status",
        "fasciotomy_done",
        "muscle_contractility",
        "iv_fluids_volume",
        "blood_products_transfused_volume"
      ],
      "timepoint": "INTRAOP"
    },
    {
      "label": "Immediate post-operative assessment",
      "measures": [
        "limb_salvage",
        "amputation",
        "level_of_amputation",
        "thrombectomy_done",
        "peripheral_arterial_pulse_status",
        "postoperative_complications"
      ],
      "timepoint": "POSTOP"
    },
    {
      "label": "Day 3",
      "measures": [
        "limb_salvage",
        "amputation",
        "level_of_amputation",
        "distal_extremity_status_after_thrombectomy",
        "revision_amputation",
        "distal_stump_status",
        "postoperative_complications"
      ],
      "timepoint": "D3"
    },
    {
      "label": "Day 30",
      "measures": [
        "limb_salvage",
        "amputation",
        "level_of_amputation",
        "distal_extremity_status_after_thrombectomy",
        "revision_amputation",
        "distal_stump_status",
        "postoperative_complications"
      ],
      "timepoint": "D30"
    },
    {
      "label": "3 months after amputation",
      "measures": [
        "whoqol_bref_score"
      ],
      "timepoint": "M3"
    }
  ],
  "unit_of_analysis": {
    "unit": "participant",
    "repeats_within_participant": false
  },
  "exploratory_ideas": [
    {
      "kind": "correlation",
      "with": [
        "mess_total_score",
        "ganga_total_score"
      ],
      "question": "Do the MESS and Ganga Hospital Open Injury Severity Score, which the methodology says will be calculated for every patient, relate to amputation in this cohort?",
      "outcome_of": "amputation"
    },
    {
      "kind": "correlation",
      "with": [
        "diabetes_mellitus",
        "smoking",
        "hypertension",
        "coronary_artery_disease"
      ],
      "question": "Is amputation associated with patient-related factors such as diabetes mellitus and smoking, which the introduction names but the list of study variables omits?",
      "outcome_of": "amputation"
    },
    {
      "kind": "correlation",
      "with": [
        "injury_severity_score"
      ],
      "question": "Does overall injury severity (Injury Severity Score), repeatedly named as an independent predictor in the review of literature, predict amputation? The proforma collects no ISS.",
      "outcome_of": "amputation"
    },
    {
      "kind": "correlation",
      "with": [
        "level_of_amputation",
        "injured_limb_region"
      ],
      "question": "Does quality of life 3 months after amputation differ by the level of amputation and by the limb involved?",
      "outcome_of": "whoqol_bref_score"
    },
    {
      "kind": "interaction",
      "with": [
        "fasciotomy_done",
        "ischemia_duration"
      ],
      "question": "Does the effect of fasciotomy on limb loss differ according to the duration of ischaemia, as the reviewed fasciotomy literature suggests?",
      "outcome_of": "amputation"
    },
    {
      "kind": "correlation",
      "with": [
        "blood_products_transfused_volume"
      ],
      "question": "Is transfusion requirement (massive transfusion) at presentation associated with amputation?",
      "outcome_of": "amputation"
    }
  ],
  "exposure_fixed_at_baseline": false
};
