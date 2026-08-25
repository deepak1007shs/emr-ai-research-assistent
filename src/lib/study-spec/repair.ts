import type { StudySpec, Variable } from "./types.ts";
import { normaliseStoredSpec, type Finding } from "./gate.ts";

/**
 * Fixing a specification without paying to rebuild it.
 *
 * Two ideas. Most findings are mechanical and cost nothing to fix, so they are
 * repaired in code. Whatever survives that is traced to the single stage that
 * owns it, so a re-draft touches one stage instead of five.
 */

/** Which ingest stage owns a finding, so only that stage is re-run. */
export type StageKey = "stage1" | "stage1b" | "stage1c" | "stage2" | "stage3";

export function stageFor(code: string): StageKey {
  if (/^(STU|TP|ELG)/.test(code)) return "stage1";
  if (/^(OBJ|OUT)/.test(code)) return "stage1b";
  if (/^(SS|POP)/.test(code)) return "stage1c";
  if (/^(VAR|CRF|GDL)/.test(code)) return "stage2";
  return "stage3"; // ADJ, TEST, SURV, TBL, REF
}

/** The cheapest stage set that covers every outstanding finding. */
export function stagesNeeded(findings: Finding[]): StageKey[] {
  const order: StageKey[] = ["stage1", "stage1b", "stage1c", "stage2", "stage3"];
  const needed = new Set(findings.filter((f) => f.severity === "ERROR").map((f) => stageFor(f.code)));
  return order.filter((s) => needed.has(s));
}

function screeningVariable(sectionId: string, order: number): Variable {
  return {
    id: "var_screening_outcome",
    label: "Screening outcome",
    role: "administrative",
    data_type: "nominal",
    subtype: "screening log category",
    categories: ["Enrolled", "Ineligible", "Declined to participate", "Other"],
    reference_level: "Enrolled",
    definition_source: "standard",
    definition_reference:
      "Flow-diagram bookkeeping: the outcome of every eligibility assessment",
    crf: {
      section_id: sectionId,
      order,
      field_type: "single_select",
      response: "[ ] Enrolled   [ ] Ineligible   [ ] Declined to participate   [ ] Other",
      options: ["Enrolled", "Ineligible", "Declined to participate", "Other"],
    },
  };
}

/**
 * Every fix that needs no judgement and therefore no model call.
 *
 * Each one either rewrites a value into the form the rest of the system expects,
 * or adds a field the reporting guideline requires and whose content is fixed.
 * Nothing here decides anything clinical.
 */
export function deterministicRepairs(input: StudySpec): {
  spec: StudySpec;
  applied: string[];
} {
  const spec = normaliseStoredSpec(structuredClone(input));
  const applied: string[] = [];

  // Tables numbered contiguously from 1, in block order.
  const BLOCKS = ["descriptive", "primary", "secondary", "exploratory", "sensitivity"];
  const ordered = [...(spec.tables ?? [])].sort(
    (a, b) => BLOCKS.indexOf(a.block) - BLOCKS.indexOf(b.block) || a.number - b.number,
  );
  const renumbered = ordered.some((t, i) => t.number !== i + 1);
  if (renumbered) {
    ordered.forEach((t, i) => (t.number = i + 1));
    spec.tables = ordered;
    applied.push("renumbered the tables contiguously, in block order");
  }

  // CRF sections ordered contiguously from 1.
  const sections = [...(spec.crf_sections ?? [])].sort((a, b) => a.order - b.order);
  if (sections.some((s, i) => s.order !== i + 1)) {
    sections.forEach((s, i) => (s.order = i + 1));
    spec.crf_sections = sections;
    applied.push("renumbered the case record form sections");
  }

  // No two fields in a section share a position.
  const bySection = new Map<string, Variable[]>();
  for (const v of spec.variables ?? []) {
    if (!v.crf) continue;
    const list = bySection.get(v.crf.section_id) ?? [];
    list.push(v);
    bySection.set(v.crf.section_id, list);
  }
  // Only when two fields actually collide. A gap in the numbering is allowed,
  // and may well be deliberate, so it is left alone.
  let resequenced = false;
  for (const list of bySection.values()) {
    const orders = list.map((v) => v.crf!.order);
    if (new Set(orders).size === orders.length) continue;
    list.sort((a, b) => a.crf!.order - b.crf!.order);
    list.forEach((v, i) => (v.crf!.order = i + 1));
    resequenced = true;
  }
  if (resequenced) applied.push("resequenced fields so no two share a position");

  // A multi-select exports as one binary column per option, or it cannot be
  // analysed without being taken apart by hand.
  let noted = 0;
  for (const v of spec.variables ?? []) {
    if (v.crf?.field_type === "multi_select" && !v.crf.export_note) {
      v.crf.export_note = "Exports as one binary column per option.";
      noted += 1;
    }
  }
  if (noted) applied.push(`added the export note to ${noted} multi-select field(s)`);

  // A guideline that requires a flow diagram requires a screening log.
  const needsFlow = ["CONSORT", "STROBE", "SPIRIT", "TREND", "RECORD"].includes(
    spec.study?.guideline ?? "",
  );
  const hasScreening = (spec.variables ?? []).some(
    (v) => v.role === "administrative" && /screen/i.test(v.label ?? ""),
  );
  if (needsFlow && !hasScreening && (spec.crf_sections ?? []).length) {
    const first = [...spec.crf_sections].sort((a, b) => a.order - b.order)[0];
    const used = (spec.variables ?? []).filter((v) => v.crf?.section_id === first.id).length;
    spec.variables = [...(spec.variables ?? []), screeningVariable(first.id, used + 1)];
    applied.push(
      `added a screening-log field, which ${spec.study.guideline} needs to draw its flow diagram`,
    );
  }

  return { spec, applied };
}
