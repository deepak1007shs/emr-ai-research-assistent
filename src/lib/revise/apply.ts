import type { SapSpec, Variable, Outcome, AnalysisRow, Objective } from "../sap/types.ts";
import type { CrfSpec, CrfField, DerivedValue, CrfSection } from "../crf/types.ts";
import type { ShellTablesSpec, ShellTable } from "../tables/types.ts";

/**
 * Splicing a revision into a document.
 *
 * The model says which entities change; this decides what that means. Applying
 * an edit is ordinary code, so the rules the documents live under survive a
 * revision without the model having to be trusted to keep them:
 *
 *   - the statistical test is never taken from a revision, because it is never
 *     stored: it is derived from the row whenever the document is rendered;
 *   - the label registry is recopied from the plan, so a form or a table cannot
 *     end up wording a variable differently;
 *   - the validators run afterwards, on the spliced document, unchanged.
 */

type Op = { op: "upsert" | "remove" };

/** Replaces or removes by key, appending anything new in the order it arrived. */
function splice<T, E extends Op>(
  current: T[],
  edits: E[] | undefined,
  keyOf: (item: T) => string,
  keyOfEdit: (edit: E) => string,
  build: (edit: E, existing: T | undefined) => T,
): { items: T[]; changed: string[] } {
  const items = [...current];
  const changed: string[] = [];

  for (const edit of edits ?? []) {
    const key = keyOfEdit(edit);
    if (!key) continue;

    const at = items.findIndex((item) => keyOf(item) === key);
    changed.push(key);

    if (edit.op === "remove") {
      if (at >= 0) items.splice(at, 1);
      continue;
    }

    const built = build(edit, at >= 0 ? items[at] : undefined);
    if (at >= 0) items[at] = built;
    else items.push(built);
  }

  return { items, changed };
}

/** Empty string means "not applicable", as everywhere else in this codebase. */
const trimmed = (v: string | undefined) => (v ?? "").trim() || undefined;

export type Applied<T> = {
  spec: T;
  /** The keys the revision touched, for the diff shown to the investigator. */
  changed: string[];
};

/* ---- the analysis plan --------------------------------------------- */

export type SapRevision = {
  summary: string;
  needs_rebuild: boolean;
  aim?: string;
  objective_edits?: (Op & Objective)[];
  variable_edits?: (Op & Variable)[];
  outcome_edits?: (Op & Outcome)[];
  analysis_edits?: (Op & AnalysisRow)[];
};

export function applySapRevision(spec: SapSpec, revision: SapRevision): Applied<SapSpec> {
  const objectives = splice(
    spec.objectives ?? [],
    revision.objective_edits,
    (o) => o.id,
    (e) => e.id,
    (e) => ({ id: e.id, tier: e.tier, question: e.question }),
  );

  const variables = splice(
    spec.variables ?? [],
    revision.variable_edits,
    (v) => v.id,
    (e) => e.id,
    (e) => ({
      id: e.id,
      label: e.label,
      data_type: e.data_type,
      unit_coding: e.unit_coding,
      role: e.role,
      exclusion_reason: trimmed(e.exclusion_reason),
    }),
  );

  const outcomes = splice(
    spec.outcomes ?? [],
    revision.outcome_edits,
    (o) => o.id,
    (e) => e.id,
    (e) => ({
      id: e.id,
      what: e.what,
      how: e.how,
      instrument: e.instrument,
      when: e.when,
      units: e.units,
      domain: e.domain,
      source_variable_ids: e.source_variable_ids ?? [],
    }),
  );

  const analyses = splice(
    spec.analyses ?? [],
    revision.analysis_edits,
    // Keyed on the objectives it answers, joined, because a row may answer
    // several and the set of them is what identifies it.
    (a) => (a.objective_ids ?? []).join(","),
    (e) => (e.objective_ids ?? []).join(","),
    (e, existing) => ({
      objective_ids: e.objective_ids ?? [],
      label: e.label,
      outcome_ids: e.outcome_ids ?? [],
      exposure_ids: e.exposure_ids ?? [],
      adjust_for_ids: e.adjust_for_ids ?? [],
      data_type: e.data_type,
      comparison: e.comparison,
      pairing: e.pairing ?? "none",
      skewed: e.skewed || undefined,
      frequency: e.frequency || undefined,
      no_adjustment_reason: e.no_adjustment_reason?.trim() || undefined,
      table_ids: e.table_ids ?? [],
      // A revision cannot name a test, and cannot silently drop an override the
      // investigator recorded earlier.
      test_override: existing?.test_override,
      override_reason: existing?.override_reason,
    }),
  );

  return {
    spec: {
      ...spec,
      aim: trimmed(revision.aim) ?? spec.aim,
      objectives: objectives.items,
      variables: variables.items,
      outcomes: outcomes.items,
      analyses: analyses.items,
    },
    changed: [
      ...objectives.changed,
      ...variables.changed,
      ...outcomes.changed,
      ...analyses.changed,
    ],
  };
}

/* ---- the case report form ------------------------------------------ */

export type CrfRevision = {
  summary: string;
  needs_rebuild: boolean;
  field_edits?: (Op & CrfField & { section_letter?: string })[];
  section_edits?: (Op & Omit<CrfSection, "fields">)[];
  derived_edits?: (Op & DerivedValue)[];
};

/** A field is identified by what it collects, or by its wording when nothing. */
const fieldKey = (f: { variable_id?: string; label?: string }) =>
  f.variable_id?.trim() || (f.label ?? "").trim().toLowerCase();

export function applyCrfRevision(
  spec: CrfSpec,
  revision: CrfRevision,
  /** The plan in force, so the wording is recopied rather than retyped. */
  labels: Record<string, string>,
): Applied<CrfSpec> {
  const changed: string[] = [];

  const buildField = (e: Op & CrfField): CrfField => ({
    variable_id: trimmed(e.variable_id),
    label: e.label ?? "",
    type: e.type,
    options: e.options?.length ? e.options : undefined,
    unit: trimmed(e.unit),
    note: trimmed(e.note),
    primary_outcome: e.primary_outcome || undefined,
  });

  // Whole sections first: replacing one replaces the fields inside it, so a
  // field edit that follows lands in the new section rather than the old.
  const sections = splice(
    spec.sections ?? [],
    revision.section_edits,
    (s) => s.letter,
    (e) => e.letter,
    (e, existing) => ({
      letter: e.letter,
      title: e.title,
      visit: e.visit,
      note: trimmed(e.note),
      fields: existing?.fields ?? [],
    }),
  );
  changed.push(...sections.changed.map((letter) => `Section ${letter}`));

  const identifiers = [...(spec.identifiers ?? [])];
  const bySection = new Map(sections.items.map((s) => [s.letter, { ...s, fields: [...s.fields] }]));

  for (const edit of revision.field_edits ?? []) {
    const key = fieldKey(edit);
    if (!key) continue;
    changed.push(labels[key] ?? edit.label ?? key);

    // No section letter means the identifier block at the top of the form.
    const target = edit.section_letter?.trim()
      ? bySection.get(edit.section_letter.trim())?.fields
      : identifiers;
    if (!target) continue;

    const at = target.findIndex((f) => fieldKey(f) === key);
    if (edit.op === "remove") {
      if (at >= 0) target.splice(at, 1);
      continue;
    }
    const built = buildField(edit);
    if (at >= 0) target[at] = built;
    else target.push(built);
  }

  const derived = splice(
    spec.derived ?? [],
    revision.derived_edits,
    (d) => d.variable_id ?? d.name.toLowerCase(),
    (e) => e.variable_id?.trim() || (e.name ?? "").trim().toLowerCase(),
    (e) => ({
      variable_id: trimmed(e.variable_id),
      name: e.name ?? "",
      from_variable_ids: e.from_variable_ids ?? [],
      how: e.how,
    }),
  );
  changed.push(...derived.changed);

  return {
    spec: {
      ...spec,
      // Recopied from the plan, never carried over from the revision.
      labels,
      identifiers,
      sections: sections.items.map((s) => bySection.get(s.letter) ?? s),
      derived: derived.items,
    },
    changed,
  };
}

/* ---- the shell tables ----------------------------------------------- */

export type TablesRevision = {
  summary: string;
  needs_rebuild: boolean;
  table_edits?: (Op & ShellTable)[];
};

export function applyTablesRevision(
  spec: ShellTablesSpec,
  revision: TablesRevision,
  labels: Record<string, string>,
): Applied<ShellTablesSpec> {
  const tables = splice(
    spec.tables ?? [],
    revision.table_edits,
    (t) => String(t.number),
    (e) => String(e.number),
    (e) => ({
      number: e.number,
      block: e.block,
      outcome_id: trimmed(e.outcome_id),
      adjusted_for: e.adjusted_for?.length ? e.adjusted_for : undefined,
      title: e.title,
      kind: e.kind,
      columns: e.columns ?? [],
      rows: (e.rows ?? []).map((r) => ({
        variable_id: trimmed(r.variable_id),
        label: r.label ?? "",
        heading: r.heading || undefined,
        indent: r.indent || undefined,
      })),
      test_applied: trimmed(e.test_applied),
      footnote: trimmed(e.footnote),
    }),
  );

  return {
    spec: {
      ...spec,
      labels,
      tables: tables.items.sort((a, b) => a.number - b.number),
    },
    changed: tables.changed.map((n) => `Table ${n}`),
  };
}

/** The wording in force, taken from the plan. */
export function labelsFrom(sap: SapSpec): Record<string, string> {
  const labels: Record<string, string> = {};
  for (const v of sap.variables ?? []) labels[v.id] = v.label;
  for (const o of sap.outcomes ?? []) labels[o.id] = o.what;
  return labels;
}
