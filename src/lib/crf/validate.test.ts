import { describe, expect, it } from "vitest";
import { validateCrf } from "./validate.ts";
import { crfFixture } from "./fixture.ts";
import type { CrfSpec } from "./types.ts";
import type { SapSpec } from "../sap/types.ts";

const clean = () => structuredClone(crfFixture) as CrfSpec;
const codes = (crf: CrfSpec, sap?: SapSpec) => validateCrf(crf, sap).findings.map((f) => f.code);

const sap = (): SapSpec => ({
  title: "A study",
  design: "prospective observational cohort",
  guideline: "STROBE",
  aim: "An aim.",
  objectives: [{ id: "P1", tier: "primary", question: "What proportion convert?" }],
  variables: [
    { id: "var_age", label: "Age", data_type: "continuous", unit_coding: "Years", role: "confounder" },
    { id: "var_sex", label: "Sex", data_type: "binary", unit_coding: "Male / Female", role: "descriptor" },
    { id: "var_height", label: "Height", data_type: "continuous", unit_coding: "cm", role: "descriptor" },
    { id: "var_weight", label: "Weight", data_type: "continuous", unit_coding: "kg", role: "descriptor" },
    { id: "var_bmi", label: "Body mass index", data_type: "continuous", unit_coding: "kg/m2", role: "confounder" },
    {
      id: "var_adhesion",
      label: "Adhesion severity",
      data_type: "ordinal",
      unit_coding: "I / II / III / IV",
      role: "predictor",
    },
    { id: "var_surgery_date", label: "Date of surgery", data_type: "continuous", unit_coding: "Date", role: "descriptor" },
    {
      id: "var_discharge_date",
      label: "Date of discharge",
      data_type: "continuous",
      unit_coding: "Date",
      role: "descriptor",
    },
    {
      id: "var_los",
      label: "Postoperative length of stay",
      data_type: "count",
      unit_coding: "Whole days",
      role: "outcome",
    },
    {
      id: "var_conversion",
      label: "Conversion to another technique",
      data_type: "binary",
      unit_coding: "Yes / No",
      role: "outcome",
    },
  ],
  outcomes: [
    {
      id: "out_conversion",
      what: "Intraoperative conversion",
      how: "the surgeon's record",
      instrument: "proforma",
      when: "the index operation",
      units: "Yes / No",
      domain: "clinical",
      source_variable_ids: ["var_conversion"],
    },
  ],
  analyses: [
    {
      objective_id: "P1",
      label: "P1 - rate",
      outcome_id: "out_conversion",
      predictor_ids: [],
      data_type: "binary",
      comparison: "single_group",
      paired: false,
      table_id: "T1",
    },
  ],
});

describe("validateCrf", () => {
  it("passes the approved form", () => {
    const { ok, findings } = validateCrf(clean(), sap());
    expect(findings.filter((f) => f.severity === "ERROR"), JSON.stringify(findings, null, 2)).toEqual([]);
    expect(ok).toBe(true);
  });

  it("CRF04 - a select with no pre-printed options", () => {
    const c = clean();
    c.sections[0].fields[1].options = [];
    expect(codes(c)).toContain("CRF04");
  });

  it("CRF05 - a number with no unit", () => {
    const c = clean();
    delete c.sections[0].fields[0].unit;
    expect(codes(c)).toContain("CRF05");
  });

  it("CRF06 - a calculated value offered as a field to fill in", () => {
    const c = clean();
    c.sections[0].fields.push({
      variable_id: "var_bmi",
      label: "Body mass index",
      type: "Number",
      unit: "kg/m2",
    });
    const findings = validateCrf(c).findings;
    expect(findings.map((f) => f.code)).toContain("CRF06");
    expect(findings.find((f) => f.code === "CRF06")?.message).toContain("cannot be audited");
  });

  it("CRF07 - a calculation whose ingredients are not collected", () => {
    const c = clean();
    c.sections[0].fields = c.sections[0].fields.filter((f) => f.variable_id !== "var_height");
    expect(codes(c)).toContain("CRF07");
  });

  it("MAP04 - an element ticked at a visit that does not exist", () => {
    const c = clean();
    c.data_elements[0].visits = ["6 Months"];
    expect(codes(c)).toContain("MAP04");
  });

  it("ROLL01 - a role in the roll-call with no field", () => {
    const c = clean();
    c.roll_call[0].field_variable_id = "";
    const findings = validateCrf(c).findings;
    expect(findings.map((f) => f.code)).toContain("ROLL01");
    expect(findings.find((f) => f.code === "ROLL01")?.message).toContain("cannot be left uncollected");
  });

  it("ROLL05 - the roll-call points at a field the form does not have", () => {
    const c = clean();
    c.roll_call[0].field_variable_id = "var_not_on_this_form";
    expect(codes(c)).toContain("ROLL05");
  });

  it("ROLL02 - the plan measures an outcome the form never collects", () => {
    const c = clean();
    c.sections[1].fields = c.sections[1].fields.filter((f) => f.variable_id !== "var_conversion");
    expect(codes(c, sap())).toContain("ROLL02");
  });

  it("ROLL03 - the plan adjusts for a variable the form never collects", () => {
    const c = clean();
    c.sections[0].fields = c.sections[0].fields.filter((f) => f.variable_id !== "var_age");
    const s = sap();
    s.analyses[0].predictor_ids = ["var_age"];
    expect(codes(c, s)).toContain("ROLL03");
  });

  it("ROLL04 - warns that a collected mediator must stay out of models", () => {
    const c = clean();
    c.sections[1].fields.push({
      variable_id: "var_op_duration",
      label: "Operative duration",
      type: "Number",
      unit: "minutes",
    });
    const s = sap();
    s.variables.push({
      id: "var_op_duration",
      label: "Operative duration",
      data_type: "continuous",
      unit_coding: "Minutes",
      role: "mediator",
    });
    const findings = validateCrf(c, s).findings;
    expect(findings.map((f) => f.code)).toContain("ROLL04");
    expect(findings.find((f) => f.code === "ROLL04")?.severity).toBe("WARN");
  });

  it("REF07 - a field claims a variable the plan does not declare", () => {
    const c = clean();
    c.sections[0].fields[0].variable_id = "var_invented";
    expect(codes(c, sap())).toContain("REF07");
  });

  it("counts a derived value as satisfying the plan", () => {
    // Length of stay is never a field, but it is derived, so the plan is served.
    const s = sap();
    s.outcomes[0].source_variable_ids = ["var_los"];
    expect(codes(clean(), s)).not.toContain("ROLL02");
  });
});

describe("a calculated value with no id of its own", () => {
  it("CRF06 - still caught when a field repeats it word for word", () => {
    const c = clean();
    // The plan does not declare it, so it has a name and no id. A field that
    // repeats that name exactly is still the same value collected by hand.
    c.derived.push({
      name: "Charlson comorbidity index",
      from_variable_ids: ["var_age"],
      how: "Summed from the recorded comorbidities",
    });
    c.sections[0].fields.push({
      label: "Charlson comorbidity index",
      type: "Number",
      unit: "points",
    });
    expect(codes(c)).toContain("CRF06");
  });
});

describe("a form's own keys", () => {
  it("lets a raw ingredient the plan never declares carry a key of its own", () => {
    // The plan analyses body mass index; the form must collect height and
    // weight, which the plan has no variable for.
    const c = clean();
    c.sections[0].fields.push({
      variable_id: "waist_cm",
      label: "Waist circumference",
      type: "Number",
      unit: "cm",
    });
    c.derived.push({
      name: "Waist to height ratio",
      from_variable_ids: ["waist_cm", "var_height"],
      how: "Waist divided by height",
    });
    expect(codes(c, sap())).not.toContain("REF07");
    expect(codes(c, sap())).not.toContain("CRF07");
  });

  it("REF07 - but still catches an id that pretends to be the plan's", () => {
    const c = clean();
    c.sections[0].fields[0].variable_id = "var_not_in_the_plan";
    const findings = validateCrf(c, sap()).findings;
    expect(findings.map((f) => f.code)).toContain("REF07");
    expect(findings.find((f) => f.code === "REF07")?.message).toContain("without the var_ prefix");
  });
});
