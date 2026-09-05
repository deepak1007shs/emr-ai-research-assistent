import { describe, expect, it } from "vitest";
import { formLabel, formNote, withoutSectionSubject, withoutSupervision } from "./form-text.ts";

/**
 * What the printed form says, as against what the plan says.
 *
 * The two documents share a spec and have different readers. The plan is read
 * by a supervisor deciding whether the form is complete; the form is read by
 * somebody with a pen and a patient in front of them. Everything below is the
 * second reader's, and the first reader's belongs in the other document.
 */

describe("the supervisor's annotations", () => {
  it("come off the label", () => {
    expect(
      withoutSupervision(
        "Tendon sheath thickening on HRUSG (TODO: not currently a distinct item on the HRUSG 'Associated Findings' checklist; add it explicitly since it is a named secondary objective)",
      ),
    ).toBe("Tendon sheath thickening on HRUSG");
  });

  it("and a NOTE parenthesis comes off too", () => {
    expect(withoutSupervision("Tendon subluxation on MRI (NOTE: the protocol is static)")).toBe(
      "Tendon subluxation on MRI",
    );
  });

  it("but a clinical parenthesis stays, because it is the field's name", () => {
    expect(withoutSupervision("Oxygen saturation (SpO2)")).toBe("Oxygen saturation (SpO2)");
    expect(withoutSupervision("De Quervain (1st dorsal compartment)")).toBe(
      "De Quervain (1st dorsal compartment)",
    );
  });
});

describe("the modality the heading already carries", () => {
  const heading = "HRUSG Index Test - Associated Findings";

  it("is not repeated on every row", () => {
    expect(withoutSectionSubject("Peritendinous fluid/oedema on HRUSG", heading)).toBe(
      "Peritendinous fluid/oedema",
    );
  });

  it("stays where the heading does not carry it", () => {
    // Under "Demographics" the modality is the only thing telling two fields
    // apart, so removing it would merge two questions into one.
    expect(withoutSectionSubject("Doppler hyperemia on HRUSG", "Demographics")).toBe(
      "Doppler hyperemia on HRUSG",
    );
  });

  it("stays when taking it away would leave nothing worth reading", () => {
    expect(withoutSectionSubject("Findings on MRI", "MRI Reference Standard")).toBe(
      "Findings on MRI",
    );
  });

  it("leaves a label that never named a modality alone", () => {
    expect(withoutSectionSubject("Tendon thickness", heading)).toBe("Tendon thickness");
  });
});

describe("the label as the form prints it", () => {
  it("drops the annotation first, then the modality", () => {
    expect(
      formLabel(
        "Tendon sheath thickening on HRUSG (TODO: add it explicitly since it is a named secondary objective)",
        "HRUSG Index Test - Associated Findings",
      ),
    ).toBe("Tendon sheath thickening");
  });
});

describe("the note under a field", () => {
  it("drops a task addressed to the investigator", () => {
    // A TODO is work for whoever is fixing the protocol. The collector cannot
    // act on it and should not be asked to read past it.
    expect(
      formNote("TODO: the original proforma recorded free text; itemised here into pre-specified categories."),
    ).toBeUndefined();
  });

  it("keeps the instruction inside a NOTE, without the word", () => {
    expect(
      formNote("NOTE: the MRI protocol described is static. Record the positional method actually used."),
    ).toBe("The MRI protocol described is static. Record the positional method actually used.");
  });

  it("leaves an ordinary capture rule alone", () => {
    expect(formNote("Complete only if retraction present.")).toBe("Complete only if retraction present.");
  });

  it("treats an empty note as none", () => {
    expect(formNote("   ")).toBeUndefined();
    expect(formNote(undefined)).toBeUndefined();
  });
});
