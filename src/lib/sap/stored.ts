import type { FactsSheet } from "../study/types.ts";
import { factsSchema } from "../facts/schema.ts";
import { gateAPasses } from "../facts/gate.ts";
import { buildSap } from "./build.ts";
import { renderSapMarkdown } from "./markdown.ts";

/**
 * The columns a finished plan row holds, from a Facts Sheet.
 *
 * One function for both ways a plan is made: a build that has just read the
 * protocol, and a reading already stored whose plan was never built. Two copies
 * of this would be two plans from one reading the day they drifted.
 */
export function planColumns(facts: FactsSheet) {
  const built = buildSap(facts);
  const { facts: _facts, ...plan } = built;
  void _facts;
  return { built, plan, markdown: renderSapMarkdown(built), pinned: built.pinned };
}

/**
 * Whether a stored reading can be built into a plan without reading the
 * protocol again.
 *
 * A reading stopped at Gate A is kept, with what it cost, because it was paid
 * for. When a Gate A rule is corrected - a categorical outcome no longer asked
 * for a unit - that reading may now pass, and reading the protocol again to get
 * the same facts would be paid for twice. The plan is code over the facts, so
 * it is built from the ones already held.
 */
export function buildableFromReading(row: {
  status: string;
  plan: unknown;
  facts: unknown;
}): boolean {
  if (row.status !== "failed" || row.plan || !row.facts) return false;
  // Parsed as the route parses it, so a reading stored before a field existed
  // takes that field's default here too, rather than failing the gate - or the
  // page - on a field that is merely absent.
  const parsed = factsSchema.safeParse(row.facts);
  return parsed.success && gateAPasses(parsed.data);
}
