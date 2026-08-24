/**
 * Types for the zero-dependency validator.
 *
 * `validate_study_spec.js` is plain CommonJS with no dependencies so it can be
 * run from CI or dropped into another program. This declaration is how the app
 * consumes it.
 */

export type Severity = "ERROR" | "WARN";

export type Finding = {
  /** Stable identifier, e.g. "OBJ01". Never renumbered. */
  code: string;
  severity: Severity;
  /** Dotted path to the offending value, e.g. "objectives[1].tier". */
  path: string;
  /** Names the offending id and says what to do about it. */
  message: string;
};

export type ValidateOptions = {
  /** Submission gate: warnings become fatal and open_items block the build. */
  final?: boolean;
};

export type ValidationResult = { ok: boolean; findings: Finding[] };

export declare function validate(spec: unknown, options?: ValidateOptions): ValidationResult;
export declare function buildIndex(spec: unknown): Record<string, unknown>;
export declare const SCHEMA: Record<string, unknown>;
export declare const ERROR: "ERROR";
export declare const WARN: "WARN";
