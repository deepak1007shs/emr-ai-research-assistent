import type { DataType, Role, SapRegistry, Variable } from "../sap/types.ts";
import { outcomeIndex, variableIndex } from "../sap/types.ts";

/**
 * What the form must collect, worked out from the plan.
 *
 * Not less, not extra. Every variable an analysis needs has a field; every
 * field traces back to something an analysis needs. Both halves are arithmetic
 * here rather than an instruction, because an instruction is something a model
 * can mean to follow and then not: asked to build a form for a trial with
 * thirteen outcomes, it wrote a roll call promising a field for each of them
 * and then wrote the pre-operative half of the form and stopped.
 *
 * Every variable the plan declares gets a field, derived ones included, named
 * as the plan names it. A derived variable's ingredients are collected too, so
 * the value can always be recomputed and checked against what was written down.
 *
 * That was not always so. A derived variable used to be excluded on the rule
 * that a number the collector arrives already holding was worked out somewhere
 * the study cannot check, which is right for a body mass index and wrong for
 * the thing a study is built on. A bloodstream infection is hospital-acquired
 * or community-acquired by a case definition a person applies at the bedside,
 * and a study whose entire comparison is that grouping had no box to write it
 * in: only the two inputs survived, and a borderline case adjudicated by a
 * clinician was lost. The ingredients protect the value; leaving the value off
 * the form protects nothing.
 *
 * A variable measured after baseline also needs a visit to be collected at,
 * which is why the plan records when each one is measured.
 */

export type RequiredField = {
  variable_id: string;
  label: string;
  data_type: DataType;
  unit_coding: string;
  role: Role;
  timepoints: string[];
  /** Why the form owes it. Printed in the finding when it is missing. */
  because: string;
};

export type RequiredDerived = {
  variable_id: string;
  label: string;
  from_variable_ids: string[];
};

const isDerived = (v: Variable | undefined) => Boolean(v?.derived_from?.length);

/**
 * Everything an analysis needs, chased through the registries.
 *
 * An outcome is needed through the variables that measure it, an exposure and a
 * confounder directly. A derived variable is replaced by what it is computed
 * from, as deep as the plan declares.
 */
function neededIds(sap: SapRegistry): Map<string, string> {
  const byVariable = variableIndex(sap);
  const byOutcome = outcomeIndex(sap);
  const why = new Map<string, string>();

  const want = (id: string, because: string, seen = new Set<string>()) => {
    if (seen.has(id)) return; // A plan that declares a cycle is caught by VAR02.
    seen.add(id);
    if (!why.has(id)) why.set(id, because);
    // And its ingredients, so the value can be recomputed and checked against
    // what was written down.
    const variable = byVariable.get(id);
    for (const input of variable?.derived_from ?? []) {
      want(input, `${because}, and it is computed from this`, seen);
    }
  };

  for (const a of sap.analyses ?? []) {
    const objectives = (a.objective_ids ?? []).join(", ") || a.label;
    for (const id of a.outcome_ids ?? []) {
      const outcome = byOutcome.get(id);
      for (const source of outcome?.source_variable_ids ?? []) {
        want(source, `${objectives} measures "${outcome?.what ?? id}" with it`);
      }
    }
    for (const id of a.exposure_ids ?? []) want(id, `${objectives} compares by it`);
    for (const id of a.adjust_for_ids ?? []) want(id, `${objectives} holds it constant`);
  }

  // A descriptor is not analysed but is still reported: the baseline table
  // describes who was in the study, and it can only describe what was
  // collected.
  for (const v of sap.variables ?? []) {
    if (v.role === "descriptor" && !isDerived(v) && !why.has(v.id)) {
      why.set(v.id, "the baseline table describes it");
    }
  }

  return why;
}

/**
 * Every field the form must carry, in registry order.
 *
 * An id an analysis needs but the registry never declared is left out: REF05
 * and REF06 already report it against the plan, and inventing a field for a
 * variable with no type and no coding would put a box on the form that nobody
 * can fill.
 */
export function requiredFields(sap: SapRegistry): RequiredField[] {
  const why = neededIds(sap);

  return (sap.variables ?? [])
    .filter((v) => why.has(v.id))
    .map((v) => ({
      variable_id: v.id,
      label: v.label,
      data_type: v.data_type,
      unit_coding: v.unit_coding,
      role: v.role,
      timepoints: v.timepoints ?? [],
      because: why.get(v.id)!,
    }));
}

/** Every value the form computes rather than collects. */
export function requiredDerived(sap: SapRegistry): RequiredDerived[] {
  const why = new Set(requiredFields(sap).map((f) => f.variable_id));
  return (sap.variables ?? [])
    .filter((v) => isDerived(v))
    .filter((v) => why.has(v.id))
    .map((v) => ({
      variable_id: v.id,
      label: v.label,
      from_variable_ids: [...(v.derived_from ?? [])],
    }));
}

/**
 * The visits the form needs, in the order the plan mentions them.
 *
 * Taken from the variables that are measured after entry and from the outcomes'
 * own timing, because a form with no section for a follow-up visit cannot
 * collect anything that happens at one.
 */
export function requiredVisits(sap: SapRegistry): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const add = (when: string) => {
    const label = when.trim();
    if (!label || seen.has(label.toLowerCase())) return;
    seen.add(label.toLowerCase());
    out.push(label);
  };

  for (const v of sap.variables ?? []) for (const t of v.timepoints ?? []) add(t);
  for (const o of sap.outcomes ?? []) if (o.when) add(o.when);
  return out;
}
