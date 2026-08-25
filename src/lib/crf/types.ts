/**
 * The case report form, and the data-collection plan behind it.
 *
 * Built after the analysis plan and checked against it: every outcome and every
 * confounder the plan names must have a field here, and every field here must
 * trace back to something the study needs.
 */

export type FieldType =
  | "Number" | "Date" | "Single-select" | "Multi-select" | "Single-select + text" | "Text" | "Text / Date";

export type CrfField = {
  /** The label as it appears on the form. */
  label: string;
  type: FieldType;
  /** The answer space: options, a unit, or a blank. Composed by the renderer. */
  options?: string[];
  unit?: string;
  /** A date mask, when the type is Date. */
  mask?: string;
  /** Free text placeholder width, for Text fields. */
  width?: "short" | "long";
  /** True for the study's primary outcome, which is set apart on the form. */
  primary_outcome?: boolean;
  /** Shown under the field, e.g. "If yes, ...". */
  note?: string;
};

export type CrfSection = {
  /** A for the first topical section, B for the next. The identifiers block has none. */
  letter: string;
  title: string;
  /** Which visit this section is filled at, matching a visit label. */
  visit?: string;
  fields: CrfField[];
  /** Printed under the table, e.g. "Body mass index is calculated. Do not enter it here." */
  note?: string;
};

export type DerivedValue = {
  name: string;
  from: string[];
  how: string;
};

/** One row of the data-collection grid. */
export type DataElement = {
  element: string;
  /** The visit labels at which this element is collected. */
  visits: string[];
};

export type RollCallEntry = {
  role: "exposure" | "primary_outcome" | "secondary_outcome" | "confounder";
  variable: string;
  /**
   * The exact label of the field that captures it, so the claim can be checked.
   * A section-and-item reference would be a pointer nothing can verify.
   * Empty when nothing captures it.
   */
  field: string;
  where: string;
};

export type CrfSpec = {
  title: string;
  institution: string;
  /** The visits, in chronological order. These are the grid's columns. */
  visits: string[];
  /** One line: prospective, retrospective, or where each part comes from. */
  capture_pattern: string;
  data_elements: DataElement[];
  roll_call: RollCallEntry[];
  collected_once: string[];
  collected_repeatedly: string[];
  /** The fixed first block. No letter. */
  identifiers: CrfField[];
  sections: CrfSection[];
  derived: DerivedValue[];
};
