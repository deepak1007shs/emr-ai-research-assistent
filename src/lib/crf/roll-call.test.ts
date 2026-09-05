import { describe, expect, it } from "vitest";
import { resolveRollCall } from "./roll-call.ts";
import { validateCrf } from "./validate.ts";
import { crfFixture } from "./fixture.ts";
import { sapFixture } from "../sap/fixture.ts";

/**
 * The roll-call points at the field that captures each role, and the pointer is
 * worked out here rather than asked for.
 *
 * It used to be asked for, and on a real diagnostic study the model wrote seven
 * pointers that named nothing: the plan declared `var_hrusg_doppler_hyperemia`,
 * the form collected it under that id, and the roll-call claimed
 * `var_hrusg_doppler`. Seven errors saying "no field on the form collects that"
 * against a form where every one of those fields existed.
 *
 * The pointer is not a judgement. It is a lookup, and a lookup belongs in code.
 */

const clone = () => structuredClone(crfFixture);

describe("resolving the roll-call against the form", () => {
  it("corrects a pointer that names nothing", () => {
    const crf = clone();
    crf.roll_call = [
      { role: "confounder", ref_id: "var_age", field_variable_id: "var_age_abbreviated", where: "Baseline" },
    ];

    expect(resolveRollCall(crf, sapFixture)[0].field_variable_id).toBe("var_age");
  });

  it("finds an outcome through the variable that measures it", () => {
    // The roll-call names the outcome; no field carries an out_ id, because a
    // form collects variables. The link runs through source_variable_ids.
    const crf = clone();
    crf.roll_call = [
      { role: "primary_outcome", ref_id: "out_conversion", field_variable_id: "", where: "Intra-op" },
    ];

    expect(resolveRollCall(crf, sapFixture)[0].field_variable_id).toBe("var_conversion");
  });

  it("leaves the pointer empty where nothing captures it", () => {
    // Which is the finding worth having: ROLL01 then says the confounder is
    // uncollected, and it is right.
    const crf = clone();
    crf.roll_call = [
      { role: "confounder", ref_id: "var_never_collected", field_variable_id: "var_never_collected", where: "Baseline" },
    ];

    expect(resolveRollCall(crf, sapFixture)[0].field_variable_id).toBe("");
  });

  it("counts a calculated value as capturing", () => {
    const crf = clone();
    const derivedId = crf.derived[0]!.variable_id!;
    crf.roll_call = [
      { role: "confounder", ref_id: derivedId, field_variable_id: "nonsense", where: "Baseline" },
    ];

    expect(resolveRollCall(crf, sapFixture)[0].field_variable_id).toBe(derivedId);
  });

  it("turns seven false errors into none", () => {
    // The whole point: a resolved roll-call cannot raise ROLL05, because the
    // pointer is read from the form rather than written by a model.
    const crf = clone();
    crf.roll_call = crf.roll_call.map((entry) => ({ ...entry, field_variable_id: `${entry.ref_id}_wrong` }));

    const before = validateCrf(crf, sapFixture).findings.filter((f) => f.code === "ROLL05");
    expect(before.length).toBeGreaterThan(0);

    crf.roll_call = resolveRollCall(crf, sapFixture);
    const after = validateCrf(crf, sapFixture).findings.filter((f) => f.code === "ROLL05");
    expect(after).toEqual([]);
  });
});
