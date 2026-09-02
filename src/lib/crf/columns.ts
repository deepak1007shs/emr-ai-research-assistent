import type { CrfSpec, CrfField } from "./types.ts";

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
  for (const field of allFields(spec)) {
    if (field.variable_id && field.column_name && !out[field.variable_id]) {
      out[field.variable_id] = field.column_name;
    }
  }
  for (const derived of spec.derived ?? []) {
    if (derived.variable_id && !out[derived.variable_id]) {
      out[derived.variable_id] = slug(derived.name ?? derived.variable_id);
    }
  }
  return out;
}
