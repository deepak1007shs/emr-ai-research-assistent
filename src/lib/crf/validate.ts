import type { CrfSpec } from "./types.ts";
import type { SapSpec } from "../sap/types.ts";
import type { Finding } from "../sap/validate.ts";

/**
 * Checks a case report form against the analysis plan it must serve.
 *
 * The roll-call in the data-collection plan is advisory when a human writes it.
 * Here it is enforced: every outcome and every confounder the plan names must
 * have a field, and a derived value must never be a field at all.
 */

const normalise = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Every field label on the form, flattened. */
function allFieldLabels(crf: CrfSpec): string[] {
  return [
    ...crf.identifiers.map((f) => f.label),
    ...crf.sections.flatMap((s) => s.fields.map((f) => f.label)),
  ];
}

/** Loose match: "Age" matches "Age at enrolment", but not "Percentage". */
function hasField(labels: string[], name: string): boolean {
  const target = normalise(name);
  return labels.some((label) => {
    const l = normalise(label);
    return l === target || l.includes(target) || target.includes(l);
  });
}

/**
 * Whether the study captures a variable at all.
 *
 * Label matching alone is too brittle: the plan may call it "intraoperative
 * conversion" while the form says "conversion to another technique". The
 * roll-call names the field explicitly, so it is consulted first; a label match
 * and a derivation are the fallbacks.
 */
function isCaptured(crf: CrfSpec, name: string, labels: string[]): boolean {
  const target = normalise(name);
  // The named field must actually exist, or the roll-call is only a claim.
  const inRollCall = crf.roll_call.some(
    (r) =>
      normalise(r.variable) === target &&
      r.field?.trim() &&
      hasField(labels, r.field),
  );
  const derived = crf.derived.some((d) => normalise(d.name) === target);
  return inRollCall || derived || hasField(labels, name);
}

export function validateCrf(crf: CrfSpec, sap?: SapSpec): { ok: boolean; findings: Finding[] } {
  const out: Finding[] = [];
  const error = (code: string, message: string) => out.push({ code, severity: "ERROR", message });
  const warn = (code: string, message: string) => out.push({ code, severity: "WARN", message });

  const labels = allFieldLabels(crf);

  /* ---- the form itself --------------------------------------------- */

  if (!crf.sections.length) error("CRF01", "The form has no sections.");

  crf.sections.forEach((section, i) => {
    const expected = String.fromCharCode(65 + i);
    if (section.letter !== expected) {
      warn("CRF02", `Section "${section.title}" is lettered ${section.letter} but is section ${i + 1}. Letter them A onward in order.`);
    }
    if (!section.fields.length) {
      error("CRF03", `Section ${section.letter} has no fields.`);
    }
    for (const field of section.fields) {
      if (/select/i.test(field.type) && !field.options?.length) {
        error("CRF04", `"${field.label}" is a ${field.type} with no options. Every choice must be pre-printed, or two data collectors will write different things.`);
      }
      if (field.type === "Number" && !field.unit) {
        error("CRF05", `"${field.label}" is a number with no unit. A number without a unit cannot be analysed.`);
      }
    }
  });

  /* ---- derived values are never fields ----------------------------- */

  for (const derived of crf.derived) {
    if (hasField(labels, derived.name)) {
      error(
        "CRF06",
        `"${derived.name}" is calculated from ${derived.from.join(" and ")}, but it also appears as a field. A computed value entered by hand cannot be audited; collect its ingredients instead.`,
      );
    }
    for (const ingredient of derived.from) {
      if (!hasField(labels, ingredient)) {
        error(
          "CRF07",
          `"${derived.name}" is calculated from "${ingredient}", which the form never collects, so it cannot be calculated.`,
        );
      }
    }
  }

  /* ---- the data-collection grid ------------------------------------ */

  for (const element of crf.data_elements) {
    if (!element.visits.length) {
      warn("MAP03", `"${element.element}" is in the plan but ticked at no visit, so it is never collected.`);
    }
    for (const visit of element.visits) {
      if (!crf.visits.includes(visit)) {
        error("MAP04", `"${element.element}" is ticked at "${visit}", which is not one of the study's visits.`);
      }
    }
  }

  /* ---- the roll-call, enforced ------------------------------------- */

  for (const entry of crf.roll_call) {
    if (entry.field?.trim() && !hasField(labels, entry.field)) {
      error(
        "ROLL05",
        `The roll-call says "${entry.variable}" is captured by "${entry.field}", but no field on the form has that label.`,
      );
    }
    if (!entry.field?.trim()) {
      error(
        "ROLL01",
        `The ${entry.role.replace(/_/g, " ")} "${entry.variable}" has no field on the form. A variable the study exists to measure cannot be left uncollected.`,
      );
    }
  }

  if (sap) {
    // Every outcome the plan analyses, and every confounder it adjusts for.
    for (const analysis of sap.analyses ?? []) {
      const outcome = analysis.outcome?.what;
      if (outcome && !isCaptured(crf, outcome, labels)) {
        error(
          "ROLL02",
          `The analysis plan measures "${outcome}" for ${analysis.objective_id}, but no field on the form collects it and nothing derives it.`,
        );
      }
    }

    for (const variable of sap.variables ?? []) {
      if (variable.role === "confounder" && !isCaptured(crf, variable.name, labels)) {
        error(
          "ROLL03",
          `The analysis plan adjusts for "${variable.name}", but the form does not collect it. An adjusted analysis cannot be run on a variable that was never recorded.`,
        );
      }
      if ((variable.role === "mediator" || variable.role === "collider") && hasField(labels, variable.name)) {
        // Collecting it is fine and often necessary; using it is not. Say so once.
        warn(
          "ROLL04",
          `"${variable.name}" is collected and is a ${variable.role}. That is fine, but it must stay out of every model.`,
        );
      }
    }
  }

  return { ok: !out.some((f) => f.severity === "ERROR"), findings: out };
}
