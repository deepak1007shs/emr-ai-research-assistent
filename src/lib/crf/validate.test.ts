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
  variables: [{ name: "Age", data_type: "continuous", unit_coding: "Years", role: "confounder" }],
  analyses: [
    {
      objective_id: "P1",
      label: "P1 - rate",
      outcome: {
        what: "Intraoperative conversion",
        how: "the surgeon's record",
        instrument: "proforma",
        when: "the index operation",
        units: "Yes / No",
        domain: "clinical",
      },
      predictors: "(single-group estimate)",
      data_type: "binary",
      comparison: "single_group",
      paired: false,
      table_ref: "T1",
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
    c.sections[0].fields.push({ label: "Body mass index", type: "Number", unit: "kg/m2" });
    const findings = validateCrf(c).findings;
    expect(findings.map((f) => f.code)).toContain("CRF06");
    expect(findings.find((f) => f.code === "CRF06")?.message).toContain("cannot be audited");
  });

  it("CRF07 - a calculation whose ingredients are not collected", () => {
    const c = clean();
    c.sections[0].fields = c.sections[0].fields.filter((f) => f.label !== "Height");
    expect(codes(c)).toContain("CRF07");
  });

  it("MAP04 - an element ticked at a visit that does not exist", () => {
    const c = clean();
    c.data_elements[0].visits = ["6 Months"];
    expect(codes(c)).toContain("MAP04");
  });

  it("ROLL01 - a role in the roll-call with no field", () => {
    const c = clean();
    c.roll_call[0].field = "";
    const findings = validateCrf(c).findings;
    expect(findings.map((f) => f.code)).toContain("ROLL01");
    expect(findings.find((f) => f.code === "ROLL01")?.message).toContain("cannot be left uncollected");
  });

  it("ROLL02 - the plan measures an outcome the form never collects", () => {
    const c = clean();
    c.sections[1].fields = c.sections[1].fields.filter(
      (f) => f.label !== "Conversion to another technique",
    );
    expect(codes(c, sap())).toContain("ROLL02");
  });

  it("ROLL03 - the plan adjusts for a variable the form never collects", () => {
    const c = clean();
    c.sections[0].fields = c.sections[0].fields.filter((f) => f.label !== "Age");
    expect(codes(c, sap())).toContain("ROLL03");
  });

  it("ROLL04 - warns that a collected mediator must stay out of models", () => {
    const c = clean();
    c.sections[1].fields.push({ label: "Operative duration", type: "Number", unit: "minutes" });
    const s = sap();
    s.variables.push({
      name: "Operative duration", data_type: "continuous", unit_coding: "Minutes", role: "mediator",
    });
    const findings = validateCrf(c, s).findings;
    expect(findings.map((f) => f.code)).toContain("ROLL04");
    expect(findings.find((f) => f.code === "ROLL04")?.severity).toBe("WARN");
  });

  it("counts a derived value as satisfying the plan", () => {
    // Length of stay is never a field, but it is derived, so the plan is served.
    const s = sap();
    s.analyses[0].outcome.what = "Postoperative length of stay";
    expect(codes(clean(), s)).not.toContain("ROLL02");
  });
});
