import {
  isCaptured,
  isDerived,
  indexSpec,
  type StudySpec,
  type Variable,
} from "../study-spec/types.ts";
import {
  bullet, h1, h2, italic, labelled, para, table, title, toBuffer, versionStamp,
  type Block,
} from "./docx-kit.ts";

/**
 * The Case Record Form.
 *
 * Captured variables only. A derived value never appears as a field to be
 * filled in, because a form records what was observed, not what can be computed
 * from it. The gate has already guaranteed that every derivation's raw
 * ingredients are somewhere on this form.
 */

const FIELD_TYPE_LABEL: Record<string, string> = {
  number: "Number",
  date: "Date",
  single_select: "Single-select",
  multi_select: "Multi-select",
  single_select_text: "Single-select + text",
  text: "Text",
};

/** The answer space: pre-printed options, a unit, or a date mask. */
function responseFor(v: Variable): string {
  const crf = v.crf!;
  if (crf.options?.length) {
    return crf.options.map((o) => `[ ] ${o}`).join("   ");
  }
  if (crf.field_type === "date") {
    return `___ / ___ / ______  (${crf.mask ?? "DD/MM/YYYY"})`;
  }
  if (crf.field_type === "number") {
    return v.unit ? `________ ${v.unit}` : crf.response;
  }
  return crf.response;
}

export async function buildCrfDocx(spec: StudySpec): Promise<Buffer> {
  const ix = indexSpec(spec);
  const doc: Block[] = [];

  doc.push(title("Case Record Form"));
  doc.push(para(spec.study.title));
  doc.push(versionStamp(spec.spec_version, "Case Record Form"));

  doc.push(
    table(
      ["Field", "Detail"],
      [
        ["Participant ID", "________________"],
        ["Site", spec.study.setting.replace(/_/g, " ")],
        ["Date form started", "___ / ___ / ______  (DD/MM/YYYY)"],
        ["Completed by", "________________"],
      ],
      { boldFirstColumn: true },
    ),
  );

  // ---- eligibility checklist
  doc.push(h1("Eligibility checklist"));
  doc.push(
    para(
      "Every criterion must be answered before randomisation. A participant who fails any inclusion criterion, or meets any exclusion criterion, is not eligible.",
    ),
  );
  doc.push(
    table(
      ["#", "Inclusion criterion", "Met?"],
      spec.eligibility.inclusion.map((c, i) => [i + 1, c.text, "[ ] Yes   [ ] No"]),
    ),
  );
  doc.push(
    table(
      ["#", "Exclusion criterion", "Present?"],
      spec.eligibility.exclusion.map((c, i) => [i + 1, c.text, "[ ] Yes   [ ] No"]),
    ),
  );

  // ---- one section per CRF section, in order
  const sections = [...spec.crf_sections].sort((a, b) => a.order - b.order);
  const captured = spec.variables.filter((v) => isCaptured(v) && !isDerived(v));

  sections.forEach((section, sectionIndex) => {
    const fields = captured
      .filter((v) => v.crf!.section_id === section.id)
      .sort((a, b) => a.crf!.order - b.crf!.order);

    if (!fields.length) return;

    doc.push(h1(`Section ${sectionIndex + 1}. ${section.title}`));

    const tp = section.timepoint_id ? ix.timepoints.get(section.timepoint_id) : undefined;
    if (tp) {
      doc.push(labelled("Time point:", `${tp.label} (window: ${tp.window})`));
    }

    doc.push(
      table(
        ["#", "Field / Variable", "Field type", "Response"],
        fields.map((v, i) => [
          i + 1,
          v.label,
          FIELD_TYPE_LABEL[v.crf!.field_type] ?? v.crf!.field_type,
          responseFor(v),
        ]),
      ),
    );

    const multi = fields.filter((v) => v.crf!.field_type === "multi_select");
    if (multi.length) {
      doc.push(
        italic(
          `Tick all that apply for: ${multi.map((v) => v.label).join(", ")}. Each option exports as its own yes/no column.`,
        ),
      );
    }
  });

  // ---- what this form deliberately does not collect
  const derived = spec.variables.filter(isDerived);
  if (derived.length) {
    doc.push(h1("Values computed from this form, not collected on it"));
    doc.push(
      para(
        "The following are calculated during analysis from the fields above. Do not record them here: a computed value entered by hand cannot be audited, and the raw data is what allows a scoring error to be corrected later.",
      ),
    );
    doc.push(
      table(
        ["Value", "Computed from", "How"],
        derived.map((v) => [
          v.label,
          (v.derived_from ?? [])
            .map((id) => ix.variables.get(id)?.label ?? id)
            .join("; "),
          v.derivation ?? "",
        ]),
      ),
    );
  }

  doc.push(h2("Form completion"));
  doc.push(bullet("Signature of person completing the form: ______________________"));
  doc.push(bullet("Date: ___ / ___ / ______"));

  return toBuffer(doc);
}
