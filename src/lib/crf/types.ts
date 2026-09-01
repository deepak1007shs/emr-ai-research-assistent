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
  /**
   * The variable this field collects, by id, when the analysis plan declares
   * one. The label is then read from the plan's registry, so the form and the
   * plan cannot describe it differently.
   */
  variable_id?: string;
  /**
   * The label, for a field the plan does not know about: identifiers, and
   * anything collected but not analysed. Ignored when variable_id is set.
   */
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
  /**
   * Who answers, where more than one person answers the same question.
   *
   * `["R1", "R2"]` gives an agreement study one response line per observer, so
   * what each of them said is recorded separately. That is the whole design: a
   * form with one line cannot hold a disagreement, and a disagreement is what
   * the study measures. Empty everywhere else, and the field prints as it
   * always has.
   */
  respondents?: string[];
};

export type CrfSection = {
  /** A for the first topical section, B for the next. The identifiers block has none. */
  letter: string;
  title: string;
  /** Which visit this section is filled at, matching a visit label. */
  visit?: string;
  fields: CrfField[];
  /**
   * Parts of this section, each its own table under the section's heading.
   *
   * One level, no deeper. An index test is often three blocks that share a
   * heading and nothing else: the scan details, the direct features and the
   * indirect ones. Flattening them into one table loses which block a finding
   * belongs to, and nesting further would produce a form nobody can follow.
   */
  sections?: CrfSection[];
  /** Printed under the table, e.g. "Body mass index is calculated. Do not enter it here." */
  note?: string;
};

export type DerivedValue = {
  /** The variable this computes, by id, when the plan declares one. */
  variable_id?: string;
  name: string;
  /** The ids of the fields it is computed from. Each must be collected. */
  from_variable_ids: string[];
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
  /** The variable or outcome this role refers to, by id. */
  ref_id: string;
  /**
   * The id of the variable the capturing field collects. Checked against the
   * form, so the claim cannot be a pointer to nothing. Empty when nothing
   * captures it, which is itself the finding.
   */
  field_variable_id: string;
  where: string;
};

export type CrfSpec = {
  /**
   * id to label, copied from the analysis plan's registry when the form is
   * built. Written by code, never retyped by the model, so a variable is worded
   * the same on the form as it is in the plan. It also lets the form render and
   * re-validate on its own, without loading the plan again.
   */
  labels: Record<string, string>;
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
