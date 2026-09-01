import { describe, expect, it } from "vitest";
import { validateCrf } from "./validate.ts";
import { crfFixture } from "./fixture.ts";
import { sapFixture } from "../sap/fixture.ts";
import type { CrfSpec } from "./types.ts";
import type { SapRegistry } from "../sap/types.ts";

const clean = () => structuredClone(crfFixture) as CrfSpec;
const codes = (crf: CrfSpec, sap?: SapRegistry) => validateCrf(crf, sap).findings.map((f) => f.code);

/**
 * The plan the form is built from.
 *
 * The real one, not a local copy of it. A local copy is how the two fixtures
 * drifted apart in the first place: the form collected height and weight and
 * derived body mass index, which is correct, while the plan it was checked
 * against declared neither.
 */
const sap = (): SapRegistry => structuredClone(sapFixture) as SapRegistry;

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

  it("a calculated value may have a field of its own", () => {
    // Both the value and what it is worked out from. The ingredients let it be
    // recomputed and checked; the value itself is what a person may have
    // decided, and for a case definition applied at the bedside that decision
    // is the variable, not a convenience.
    const c = clean();
    c.sections[0].fields.push({
      variable_id: "var_bmi",
      label: "Body mass index",
      type: "Number",
      unit: "kg/m2",
    });
    expect(codes(c, sap())).not.toContain("CRF06");
    expect(codes(c, sap())).not.toContain("CRF10");
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
    s.analyses[0].adjust_for_ids = ["var_age"];
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

describe("not less, not extra", () => {
  it("CRF09 - the form leaves out something an analysis needs", () => {
    const c = clean();
    const p = sap();
    // Every field for the exposure is removed, including the one in a section's
    // parts, which the checks now see as well.
    const drop = (f: { variable_id?: string }) => f.variable_id !== "var_adhesion";
    for (const section of c.sections) {
      section.fields = section.fields.filter(drop);
      for (const part of section.sections ?? []) part.fields = part.fields.filter(drop);
    }
    const found = validateCrf(c, p).findings.find((f) => f.code === "CRF09");
    expect(found?.message).toContain("Adhesion severity");
    expect(found?.message).toContain("cannot be analysed");
  });

  it("CRF09 - and says why the form owed it", () => {
    const c = clean();
    for (const section of c.sections) {
      section.fields = section.fields.filter((f) => f.variable_id !== "var_age");
    }
    const found = validateCrf(c, sap()).findings.find((f) => f.code === "CRF09");
    expect(found?.message).toMatch(/holds it constant|describes it/);
  });

  it("CRF10 - a calculated value recorded with nothing to check it against", () => {
    // The grouping a whole study compares by, written down and never traceable:
    // only what the classifier decided survives, and nobody can tell whether
    // the case definition was applied the same way twice.
    const c = clean();
    const p = sap();
    for (const section of c.sections) {
      section.fields = section.fields.filter(
        (f) => f.variable_id !== "var_height" && f.variable_id !== "var_weight",
      );
    }
    c.derived = c.derived.filter((d) => d.variable_id !== "var_bmi");
    c.sections[0].fields.push({ variable_id: "var_bmi", label: "Body mass index", type: "Number" });
    const found = validateCrf(c, p).findings.find((f) => f.code === "CRF10");
    expect(found?.message).toContain("Body mass index");
    expect(found?.message).toContain("cannot be checked against anything");
  });

  it("CRF13 - a field that answers no question and feeds no calculation", () => {
    const c = clean();
    c.sections[0].fields.push({
      variable_id: "chief_complaints",
      label: "Chief complaints",
      type: "Text",
    });
    const found = validateCrf(c, sap()).findings.find((f) => f.code === "CRF13");
    expect(found?.message).toContain("Chief complaints");
    expect(found?.message).toContain("costs the person filling it in");
    expect(found?.severity).toBe("WARN");
  });

  it("CRF13 - but not one a calculated value is computed from", () => {
    // Height and weight answer no question on their own; body mass index is
    // computed from them, which is what makes them worth collecting.
    const c = clean();
    const raw = c.sections[0].fields.map((f) => f.variable_id);
    expect(raw).toContain("var_height");
    const found = validateCrf(c, sap()).findings.filter((f) => f.code === "CRF13");
    expect(found.map((f) => f.message).join(" ")).not.toContain("Height");
  });

  it("CRF13 - and not an identifier, which is capture infrastructure", () => {
    const found = validateCrf(clean(), sap()).findings.filter((f) => f.code === "CRF13");
    expect(found.map((f) => f.message).join(" ")).not.toContain("Study subject ID");
  });

  it("CRF12 - the plan measures at a visit the form has no section for", () => {
    const c = clean();
    const p = sap();
    p.variables = p.variables.map((v) =>
      v.id === "var_conversion" ? { ...v, timepoints: ["six weeks after surgery"] } : v,
    );
    const found = validateCrf(c, p).findings.find((f) => f.code === "CRF12");
    expect(found?.message).toContain("six weeks after surgery");
    expect(found?.severity).toBe("WARN");
  });

  it("the clean fixture asks for nothing extra and leaves nothing out", () => {
    const found = validateCrf(clean(), sap()).findings.filter((f) =>
      ["CRF09", "CRF10", "CRF11"].includes(f.code),
    );
    expect(found, JSON.stringify(found, null, 2)).toEqual([]);
  });
});

describe("a calculated value with no id of its own", () => {
  it("a field repeating a calculated value word for word is no longer an error", () => {
    // It was, on the rule that a computed value entered by hand cannot be
    // audited. The ingredients are what make it auditable, and they are
    // required separately.
    const c = clean();
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
    expect(codes(c, sap())).not.toContain("CRF06");
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

describe("the field must hold what the plan says the variable is", () => {
  it("CRF08 - a categorical variable collected as free text", () => {
    // The case this was written for: a plan declared parity nominal, and the
    // form gave it a text box because TPAL counts cannot be enumerated as
    // options. Neither is right, and the form said nothing.
    const c = clean();
    const s = sap();
    s.variables.push({
      id: "var_parity",
      label: "Parity",
      data_type: "nominal",
      unit_coding: "TPAL format",
      role: "descriptor",
    });
    c.sections[0].fields.push({ variable_id: "var_parity", label: "Parity", type: "Text" });

    const findings = validateCrf(c, s).findings;
    expect(findings.map((f) => f.code)).toContain("CRF08");
    const message = findings.find((f) => f.code === "CRF08")!.message;
    expect(message).toContain("nominal in the analysis plan");
    expect(message).toContain("not a Text field");
    // And it says why the plan itself may be the thing that is wrong.
    expect(message).toContain("not nominal");
  });

  it("CRF08 - a count collected as free text cannot be added up", () => {
    const c = clean();
    const s = sap();
    s.variables.push({
      id: "var_gravida", label: "Gravida", data_type: "count",
      unit_coding: "pregnancies", role: "descriptor",
    });
    c.sections[0].fields.push({ variable_id: "var_gravida", label: "Gravida", type: "Text" });

    const findings = validateCrf(c, s).findings;
    expect(findings.find((f) => f.code === "CRF08")?.message).toContain("added up");
  });

  it("accepts a select for a binary variable, and a number for a count", () => {
    const c = clean();
    const s = sap();
    s.variables.push({
      id: "var_gravida", label: "Gravida", data_type: "count",
      unit_coding: "pregnancies", role: "descriptor",
    });
    c.sections[0].fields.push({
      variable_id: "var_gravida", label: "Gravida", type: "Number", unit: "pregnancies",
    });
    // var_sex is binary in the plan and a Single-select on the form already.
    expect(codes(c, s)).not.toContain("CRF08");
  });

  it("says nothing about a field the plan does not declare", () => {
    // A raw ingredient the plan derives from is the form's own business.
    const c = clean();
    c.sections[0].fields.push({ variable_id: "waist_cm", label: "Waist", type: "Text" });
    expect(codes(c, sap())).not.toContain("CRF08");
  });
});
