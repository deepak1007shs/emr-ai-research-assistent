import type { CrfSpec, CrfField } from "./types.ts";
import type { SapRegistry } from "../sap/types.ts";

/**
 * The name each field carries into the datasheet.
 *
 * Decided once, on the form, and used by the form, the analysis blueprint and
 * whatever spreadsheet the data are typed into. Without it the analyst matches
 * a column headed "Age (years)" to a blueprint row headed "Age" by eye, and a
 * study with sixty variables gets that wrong somewhere.
 *
 * The model proposes the name, because a good one needs judgement no rule has:
 * "dm" for diabetes mellitus, "hb_gdl" for haemoglobin with its unit. What code
 * does is guarantee the two properties the model cannot: that every field has
 * one, and that no two fields share one. A duplicated column name is worse than
 * a clumsy one, because two variables silently become the same column.
 */

/** A serviceable name from a label, for a field the model left unnamed. */
export function slug(label: string): string {
  const cleaned = label
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (!cleaned) return "field";

  // Long enough to read, short enough to be a spreadsheet header. Whole words
  // only: a character cut turns "asa_physical_status_grade" into
  // "asa_physical_status_grad", which reads as a typo rather than a name.
  const words = cleaned.split("_").filter(Boolean).slice(0, 4);
  while (words.length > 1 && words.join("_").length > 32) words.pop();
  return words.join("_");
}

/** Every field on the form, in the order it prints, including sub-sections. */
export function allFields(spec: CrfSpec): CrfField[] {
  const out: CrfField[] = [...(spec.identifiers ?? [])];
  for (const section of spec.sections ?? []) {
    out.push(...(section.fields ?? []));
    for (const part of section.sections ?? []) out.push(...(part.fields ?? []));
  }
  return out;
}

/**
 * Fills in what is missing and breaks any tie, in place of the given spec.
 *
 * A second field wanting a taken name gets a numbered suffix rather than the
 * name: `dm` and `dm_2` are obviously the same question asked twice, which is
 * a thing worth seeing on the form rather than hiding behind a cleverer name.
 */
export function assignColumnNames(spec: CrfSpec): CrfSpec {
  const taken = new Set<string>();

  const unique = (wanted: string): string => {
    if (!taken.has(wanted)) {
      taken.add(wanted);
      return wanted;
    }
    for (let n = 2; ; n += 1) {
      const candidate = `${wanted}_${n}`;
      if (!taken.has(candidate)) {
        taken.add(candidate);
        return candidate;
      }
    }
  };

  const name = (field: CrfField, fallback: string) =>
    unique(slug(field.column_name?.trim() || field.label?.trim() || fallback));

  const fixField = (field: CrfField, index: number): CrfField => ({
    ...field,
    column_name: name(field, field.variable_id ?? `field_${index}`),
  });

  let n = 0;
  return {
    ...spec,
    identifiers: (spec.identifiers ?? []).map((f) => fixField(f, n++)),
    sections: (spec.sections ?? []).map((section) => ({
      ...section,
      fields: (section.fields ?? []).map((f) => fixField(f, n++)),
      sections: section.sections?.map((part) => ({
        ...part,
        fields: (part.fields ?? []).map((f) => fixField(f, n++)),
      })),
    })),
  };
}

/**
 * Variable id to datasheet column, for the documents built from the form.
 *
 * Only fields the plan declares a variable for appear: a field with no
 * variable_id is a raw ingredient or an identifier, and nothing downstream
 * refers to it by id.
 */
export function columnsByVariable(spec: CrfSpec | null | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!spec) return out;

  // The fields first, because those names were decided on the form and are what
  // whoever fills it in will see.
  const taken = new Set<string>();
  for (const field of allFields(spec)) {
    if (!field.variable_id || !field.column_name || out[field.variable_id]) continue;
    out[field.variable_id] = field.column_name;
    taken.add(field.column_name);
  }

  // Then the derived values, which have no field of their own and so no name
  // decided for them. Uniqueness has to hold here too: a derived value slugging
  // to a name a field already has would put two variables in one spreadsheet
  // column, which is the whole failure the naming exists to prevent, and it
  // would do it silently.
  for (const derived of spec.derived ?? []) {
    if (!derived.variable_id || out[derived.variable_id]) continue;
    let name = slug(derived.name ?? derived.variable_id);
    for (let n = 2; taken.has(name); n += 1) {
      name = `${slug(derived.name ?? derived.variable_id)}_${n}`;
    }
    out[derived.variable_id] = name;
    taken.add(name);
  }
  return out;
}

/**
 * The datasheet name of every variable the plan declares.
 *
 * One authority, because the case report form and the shell tables describe the
 * same variables - the form's fields are computed from this registry - and a
 * variable called `asa_grade` on the form and `asa` in a table is one variable
 * the analyst has to match by eye.
 *
 * Named from the plan's own label, in registry order, so the name does not move
 * when a field is added to the form.
 */
export function columnsForPlan(sap: SapRegistry | null | undefined): Record<string, string> {
  const taken = new Set<string>();
  const out: Record<string, string> = {};

  for (const variable of sap?.variables ?? []) {
    const wanted = slug(variable.label || variable.id);
    let name = wanted;
    for (let n = 2; taken.has(name); n += 1) name = `${wanted}_${n}`;
    taken.add(name);
    out[variable.id] = name;
  }

  return out;
}
