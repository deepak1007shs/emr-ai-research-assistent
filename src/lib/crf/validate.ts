import type { CrfSpec } from "./types.ts";
import type { SapSpec } from "../sap/types.ts";
import { variableIndex } from "../sap/types.ts";
import type { Finding } from "../sap/validate.ts";

/**
 * Checks a case report form against the analysis plan it must serve.
 *
 * Everything links by id. There is no word matching here: a form and a plan that
 * refer to the same variable refer to the same id, or the build fails. The fuzzy
 * matcher this file used to carry existed only because there were no ids.
 */

/**
 * An id that claims to come from the analysis plan.
 *
 * The plan's ids are prefixed; a form is free to key its own raw fields any
 * other way. Without that convention a typo and a legitimate local key are
 * indistinguishable, and one of them has to be reported.
 */
function isPlanId(id: string): boolean {
  return /^(var|out)_/.test(id);
}

/** Every variable id the form collects, whether captured or derived. */
function capturedIds(crf: CrfSpec): Set<string> {
  const ids = new Set<string>();
  for (const f of crf.identifiers) if (f.variable_id) ids.add(f.variable_id);
  for (const s of crf.sections) for (const f of s.fields) if (f.variable_id) ids.add(f.variable_id);
  return ids;
}

function derivedIds(crf: CrfSpec): Set<string> {
  return new Set(crf.derived.map((d) => d.variable_id).filter((id): id is string => Boolean(id)));
}

export function validateCrf(crf: CrfSpec, sap?: SapSpec): { ok: boolean; findings: Finding[] } {
  const out: Finding[] = [];
  const error = (code: string, message: string) => out.push({ code, severity: "ERROR", message });
  const warn = (code: string, message: string) => out.push({ code, severity: "WARN", message });

  const captured = capturedIds(crf);
  const derived = derivedIds(crf);
  const byVariable = sap ? variableIndex(sap) : new Map();
  const nameOf = (id: string) => byVariable.get(id)?.label ?? crf.labels?.[id] ?? id;

  /* ---- the form itself --------------------------------------------- */

  if (!crf.sections.length) error("CRF01", "The form has no sections.");

  crf.sections.forEach((section, i) => {
    const expected = String.fromCharCode(65 + i);
    if (section.letter !== expected) {
      warn("CRF02", `Section "${section.title}" is lettered ${section.letter} but is section ${i + 1}. Letter them A onward in order.`);
    }
    if (!section.fields.length) error("CRF03", `Section ${section.letter} has no fields.`);

    for (const field of section.fields) {
      const name = field.variable_id ? nameOf(field.variable_id) : field.label;
      if (/select/i.test(field.type) && !field.options?.length) {
        error("CRF04", `"${name}" is a ${field.type} with no options. Every choice must be pre-printed, or two data collectors will write different things.`);
      }
      if (field.type === "Number" && !field.unit) {
        error("CRF05", `"${name}" is a number with no unit. A number without a unit cannot be analysed.`);
      }
      // A field's id is either the plan's, or the form's own key for a raw
      // value the plan derives from. The prefix is what tells them apart, so a
      // near-miss on a real id is caught and a legitimate local key is not.
      if (field.variable_id && sap && isPlanId(field.variable_id) && !byVariable.has(field.variable_id)) {
        error(
          "REF07",
          `A field claims to collect ${field.variable_id}, which looks like a variable from the analysis plan but is not one. Either correct the id, or give the field a key of its own without the var_ prefix.`,
        );
      }
    }
  });

  /* ---- derived values are never fields ----------------------------- */

  // The wording every field carries, for the values the plan never declared.
  // This is exact equality after trimming and case folding, not a substring
  // test: two entries either say the same thing or they do not.
  const key = (v: string) => v.trim().toLowerCase();
  const fieldWordings = new Set<string>();
  for (const f of crf.identifiers) fieldWordings.add(key(f.label));
  for (const s of crf.sections) for (const f of s.fields) fieldWordings.add(key(f.label));

  for (const d of crf.derived) {
    const duplicated = d.variable_id
      ? captured.has(d.variable_id)
      : fieldWordings.has(key(d.name));
    if (duplicated) {
      error(
        "CRF06",
        `"${d.name}" is calculated, but a field also collects it. A computed value entered by hand cannot be audited; collect its ingredients instead.`,
      );
    }
    for (const id of d.from_variable_ids) {
      if (!captured.has(id)) {
        error(
          "CRF07",
          `"${d.name}" is calculated from ${nameOf(id)}, which the form never collects, so it cannot be calculated.`,
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

  /* ---- the roll-call, enforced by id -------------------------------- */

  for (const entry of crf.roll_call) {
    if (!entry.field_variable_id?.trim()) {
      error(
        "ROLL01",
        `The ${entry.role.replace(/_/g, " ")} ${nameOf(entry.ref_id)} has no field on the form. A variable the study exists to measure cannot be left uncollected.`,
      );
      continue;
    }
    if (!captured.has(entry.field_variable_id) && !derived.has(entry.field_variable_id)) {
      error(
        "ROLL05",
        `The roll-call says ${nameOf(entry.ref_id)} is captured by ${entry.field_variable_id}, but no field on the form collects that.`,
      );
    }
  }

  if (sap) {
    // Every outcome the plan measures, by the ids it measures it with.
    for (const outcome of sap.outcomes ?? []) {
      for (const id of outcome.source_variable_ids ?? []) {
        if (!captured.has(id) && !derived.has(id)) {
          error(
            "ROLL02",
            `The plan measures "${outcome.what}" using ${nameOf(id)}, but no field collects it and nothing derives it.`,
          );
        }
      }
    }

    // Every confounder any analysis adjusts for.
    const adjustedFor = new Set((sap.analyses ?? []).flatMap((a) => a.predictor_ids ?? []));
    for (const id of adjustedFor) {
      if (!captured.has(id) && !derived.has(id)) {
        error(
          "ROLL03",
          `The plan adjusts for ${nameOf(id)}, but the form does not collect it. An adjusted analysis cannot be run on a variable that was never recorded.`,
        );
      }
    }

    for (const variable of sap.variables ?? []) {
      if ((variable.role === "mediator" || variable.role === "collider") && captured.has(variable.id)) {
        // Collecting it is fine and often necessary; using it is not.
        warn(
          "ROLL04",
          `"${variable.label}" is collected and is a ${variable.role}. That is fine, but it must stay out of every model.`,
        );
      }
    }
  }

  return { ok: !out.some((f) => f.severity === "ERROR"), findings: out };
}
