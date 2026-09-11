import type { VariableName } from "../study/types.ts";

/**
 * The name a variable is known by, everywhere.
 *
 * Step 1 links an objective to its outcome before Step 2 has written the master
 * variable list, so both steps have to arrive at the same name from the same
 * words without consulting each other. One function does that. If Step 1 wrote
 * "haemoglobin change" and Step 2 wrote "hb_change", every check that walks
 * from an objective to its tables would find nothing and report a clean pass,
 * which is the worst kind of failure this build can have.
 *
 * Deliberately dull: lower case, words joined by underscores, nothing else. It
 * is not trying to produce the short names a statistician would type. A
 * shortening rule ("haemoglobin" to "hb") is a list of medical abbreviations,
 * and a list like that is wrong for the next study in a way nobody notices.
 */
export function variableName(label: string): VariableName {
  return label
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}
