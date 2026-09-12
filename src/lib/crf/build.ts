import type { CheckResult, CrfField, CrfSection, CrfTrace } from "../study/types.ts";
import type { SapBuild } from "../sap/build.ts";
import { checkById } from "../checks/registry.ts";
import { buildFieldList } from "./fields.ts";
import { buildSections } from "./sections.ts";
import { gateC, step8Checks } from "./checks.ts";

/**
 * Step 8: the Case Record Form, built from the plan and nothing else.
 *
 * One function, no model call. It reads the shell tables, the variable list and
 * the Analysis Map that `buildSap` already produced, and everything it decides
 * is a set operation over them. Run it twice on one plan and the two forms are
 * identical, which is the same acceptance test the plan itself passes.
 *
 * The form is self-contained on purpose: every label, unit, option and trace is
 * on it. The download route re-renders the Word file from the stored row alone,
 * so a form survives its plan being rebuilt, and a reader opening it a year
 * later sees what was collected rather than what would be collected today.
 */

export type CrfForm = {
  /** The study's own title, printed under "CASE RECORD FORM". */
  title: string;
  sections: CrfSection[];
  /** In print order: section order, then number within the section. */
  fields: CrfField[];
  /** Why each field is there, keyed `<section>:<sno>`. Printed nowhere. */
  traces: Record<string, CrfTrace[]>;
  /** Variables no table uses. C6 drops them; they are listed as evidence. */
  dropped: string[];
  /** The contract the page and the file both state. */
  counts: { sections: number; fields: number };
  /** CRF-1 and CRF-2, then Gate C. Written whether or not they pass. */
  checks: CheckResult[];
  todos: string[];
  /** The plan this form was built from, so an older one can say so. */
  sap_id: string | null;
};

export function buildCrf(build: SapBuild, sapId: string | null = null): CrfForm {
  const list = buildFieldList({
    facts: build.facts,
    variables: build.variables,
    tables: build.tables,
    analysis: build.analysis,
    rules: build.rules,
  });

  const grouped = buildSections(build.facts, list);

  const input = {
    facts: build.facts,
    variables: build.variables,
    tables: build.tables,
    sections: grouped.sections,
    fields: grouped.fields,
    traces: grouped.traces,
  };

  // Gate C does not stop the form being written. A form with a failing check is
  // the most useful thing an investigator can be shown: it names the field or
  // the table that failed and what to do about it, and hiding it behind an
  // error would leave them with a message and no form. The plan's own gates
  // work the same way.
  const checks = [...step8Checks(input), ...gateC(input)];

  const failures = checks
    .filter((check) => !check.pass && checkById(check.id)?.type !== "warn")
    .map((check) => check.message);

  return {
    title: build.facts.title,
    sections: grouped.sections,
    fields: grouped.fields,
    traces: grouped.traces,
    dropped: list.dropped,
    counts: { sections: grouped.sections.length, fields: grouped.fields.length },
    checks,
    todos: [...new Set([...grouped.todos, ...failures])],
    sap_id: sapId,
  };
}

export const crfBlockers = (form: CrfForm) =>
  form.checks.filter((c) => !c.pass && checkById(c.id)?.type !== "warn");

export const crfWarnings = (form: CrfForm) =>
  form.checks.filter((c) => !c.pass && checkById(c.id)?.type === "warn");
