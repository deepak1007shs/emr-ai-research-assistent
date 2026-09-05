import { outcomeIndex, type SapRegistry } from "../sap/types.ts";
import { capturedIds, derivedIds } from "./validate.ts";
import type { CrfSpec, RollCallEntry } from "./types.ts";

/**
 * Which field captures each role, worked out from the form.
 *
 * The roll-call is the evidence that every exposure, outcome and confounder the
 * plan names has somewhere to be written down. Its pointer used to be asked of
 * the model, and a pointer is not a judgement: it is a lookup, and a model
 * asked for a lookup will sometimes shorten it. On a diagnostic study the plan
 * declared `var_hrusg_doppler_hyperemia`, the form collected it under exactly
 * that id, and the roll-call claimed `var_hrusg_doppler`. Seven errors reading
 * "no field on the form collects that", against a form where all seven fields
 * were present.
 *
 * Read from the form instead, the pointer cannot name a field that is not
 * there. What survives is the finding worth having: where nothing captures the
 * role the pointer is empty, and ROLL01 says so.
 */
export function resolveRollCall(crf: CrfSpec, sap?: SapRegistry): RollCallEntry[] {
  const captured = capturedIds(crf);
  const derived = derivedIds(crf);
  const holds = (id: string) => captured.has(id) || derived.has(id);
  const outcomes = sap ? outcomeIndex(sap) : new Map();

  return (crf.roll_call ?? []).map((entry) => ({
    ...entry,
    field_variable_id: capturedBy(entry.ref_id, holds, outcomes),
  }));
}

/**
 * A form collects variables, so an outcome is captured through the variables
 * that measure it. The first that the form actually holds is the answer: where
 * an outcome is measured by two variables and only one is collected, the
 * pointer names the one a reader can go and look at.
 */
function capturedBy(
  refId: string | undefined,
  holds: (id: string) => boolean,
  outcomes: Map<string, { source_variable_ids?: string[] }>,
): string {
  const id = refId?.trim();
  if (!id) return "";
  if (holds(id)) return id;
  for (const source of outcomes.get(id)?.source_variable_ids ?? []) {
    if (holds(source)) return source;
  }
  return "";
}
