import { indexSpec, isDerived, type StudySpec } from "../study-spec/types.ts";
import {
  bullet, h1, h2, italic, labelled, para, table, title, statusNotice, toBuffer, versionStamp,
  type Block,
} from "./docx-kit.ts";

/**
 * The Statistical Analysis Plan.
 *
 * Everything here is read from the spec. Where a section would need a fact the
 * spec does not hold, that is a schema bug and the field is added to both the
 * schema and the type, never defaulted here.
 */

const TIER_ORDER = { primary: 0, secondary: 1, exploratory: 2 } as const;

export async function buildSapDocx(
  spec: StudySpec,
  options: { notice?: string } = {},
): Promise<Buffer> {
  const ix = indexSpec(spec);
  const doc: Block[] = [];

  doc.push(title("Statistical Analysis Plan"));
  doc.push(para(spec.study.title));
  doc.push(versionStamp(spec.spec_version, "Statistical Analysis Plan"));
  doc.push(...statusNotice(options.notice));

  // ---- 0
  doc.push(h1("Section 0. Study at a glance"));
  doc.push(
    table(
      ["Item", "This study"],
      [
        ["Title", spec.study.title],
        ["Design", spec.study.design.replace(/_/g, " ")],
        ["Reporting guideline", spec.study.guideline],
        ["Setting", `${spec.study.setting.replace(/_/g, " ")}${spec.study.centres ? `, ${spec.study.centres} centre(s)` : ""}`],
        ["Population", spec.study.population],
        ["Groups", (spec.study.groups ?? []).map((g) => g.label).join(" versus ")],
        ["Primary outcome", spec.outcomes.find((o) => o.tier === "primary")?.label ?? ""],
        ["Sample size", `${spec.sample_size.n_total} total${spec.sample_size.n_per_group ? `, ${spec.sample_size.n_per_group} per group` : ""}`],
        ["What may be claimed", spec.study.claim_strength ?? ""],
      ],
      { boldFirstColumn: true },
    ),
  );

  // ---- 1
  doc.push(h1("Section 1. Objectives as answerable questions"));
  const objectives = [...spec.objectives].sort((a, b) => TIER_ORDER[a.tier] - TIER_ORDER[b.tier]);
  for (const o of objectives) {
    doc.push(h2(`${o.tier[0].toUpperCase()}${o.tier.slice(1)} objective`));
    doc.push(para(o.question));
    if (o.comparison_type && o.comparison_type !== "none") {
      doc.push(
        labelled(
          "Comparison:",
          `${o.comparison_type.replace(/_/g, "-")}${o.margin ? `, margin ${o.margin}` : ""}`,
        ),
      );
    }
    for (const outId of o.outcome_ids ?? []) {
      const out = ix.outcomes.get(outId);
      if (!out) continue;
      doc.push(bullet(`${out.label}: ${out.definition}`));
      doc.push(
        bullet(
          `Measured by ${out.instrument} at ${ix.timepoints.get(out.timepoint_id)?.label ?? out.timepoint_id}; summarised as ${out.summary_statistic}${out.unit ? ` (${out.unit})` : ""}; ${out.data_type}${out.subtype ? `, ${out.subtype}` : ""}.`,
          1,
        ),
      );
    }
    if (o.estimand) {
      doc.push(h2("Estimand (ICH E9(R1))"));
      doc.push(
        table(
          ["Attribute", "Definition"],
          [
            ["Treatment condition", o.estimand.treatment_condition ?? ""],
            ["Population", o.estimand.population ?? ""],
            ["Endpoint", o.estimand.endpoint ?? ""],
            ["Intercurrent-event strategy", (o.estimand.intercurrent_event_strategy ?? "").replace(/_/g, " ")],
            ["Population-level summary", o.estimand.population_level_summary ?? ""],
          ],
          { boldFirstColumn: true },
        ),
      );
    }
  }

  // ---- 2
  doc.push(h1("Section 2. Variables"));
  doc.push(
    para(
      "Every variable below is either collected on the case record form or computed from variables that are. Nothing is analysed that is not collected, and nothing is collected that is not used.",
    ),
  );
  doc.push(
    table(
      ["Variable", "Role", "Type", "Unit or levels", "Definition from"],
      spec.variables.map((v) => [
        v.label,
        v.role.replace(/_/g, " "),
        `${v.data_type}${v.subtype ? `, ${v.subtype}` : ""}`,
        v.unit ?? (v.categories ?? []).join(" / "),
        v.definition_reference ?? "",
      ]),
    ),
  );

  // ---- 3
  const derived = spec.variables.filter(isDerived);
  doc.push(h1("Section 3. Derived variables and scores"));
  if (derived.length) {
    doc.push(
      para(
        "These are computed during analysis. They are not collected on the form, so a scoring error remains correctable and an alternative definition can be applied to the same data.",
      ),
    );
    doc.push(
      table(
        ["Derived value", "Kind", "Computed from", "Formula"],
        derived.map((v) => [
          v.label,
          v.derivation_kind ?? "",
          (v.derived_from ?? []).map((id) => ix.variables.get(id)?.label ?? id).join("; "),
          v.derivation ?? "",
        ]),
      ),
    );
  } else {
    doc.push(para("This study derives no variables; every value is collected directly."));
  }

  // ---- 4
  doc.push(h1("Section 4. Analysis map"));
  doc.push(
    table(
      ["Objective", "Outcome", "Unadjusted test", "Adjusted model", "Adjusted for", "Effect measure", "Table"],
      spec.analyses.map((a) => {
        const out = ix.outcomes.get(a.outcome_id);
        return [
          ix.objectives.get(a.objective_id)?.tier ?? a.objective_id,
          out?.label ?? a.outcome_id,
          a.unadjusted_test.replace(/_/g, " "),
          a.adjusted_model ? a.adjusted_model.replace(/_/g, " ") : "none",
          (a.covariate_ids ?? []).map((id) => ix.variables.get(id)?.label ?? id).join("; ") || "n/a",
          a.effect_measure ? a.effect_measure.replace(/_/g, " ") : "",
          (a.table_ids ?? []).map((id) => `Table ${ix.tables.get(id)?.number ?? "?"}`).join(", "),
        ];
      }),
    ),
  );
  for (const a of spec.analyses) {
    if (a.override_justification) {
      doc.push(
        labelled(
          `Deviation from the standard test for ${ix.outcomes.get(a.outcome_id)?.label ?? a.outcome_id}:`,
          a.override_justification,
        ),
      );
    }
  }

  // ---- 5
  doc.push(h1("Section 5. Sample size"));
  doc.push(
    labelled(
      "Powered on:",
      ix.outcomes.get(spec.sample_size.powered_outcome_id)?.label ?? spec.sample_size.powered_outcome_id,
    ),
  );
  doc.push(
    table(
      ["Input", "Value", "Source"],
      [
        ...spec.sample_size.inputs.map((i) => [i.name, String(i.value), i.source ?? "not stated"]),
        ["alpha (two-sided)", String(spec.sample_size.alpha), ""],
        ["power", String(spec.sample_size.power), ""],
        ["attrition allowance", spec.sample_size.attrition !== undefined ? String(spec.sample_size.attrition) : "none stated", ""],
      ],
      { boldFirstColumn: true },
    ),
  );
  doc.push(
    labelled(
      "Result:",
      `${spec.sample_size.n_total} participants in total${spec.sample_size.n_per_group ? `, ${spec.sample_size.n_per_group} per group` : ""}, using the ${spec.sample_size.formula.replace(/_/g, " ")} formula.`,
    ),
  );

  // ---- 6
  doc.push(h1("Section 6. General statistical rules"));
  if (spec.populations?.length) {
    doc.push(h2("Analysis populations"));
    doc.push(
      table(
        ["Population", "Definition", "Used for"],
        spec.populations.map((p) => [
          `${p.label}${p.primary ? " (primary)" : ""}`,
          p.definition,
          p.used_for ?? "",
        ]),
      ),
    );
  }
  if (spec.multiplicity?.length) {
    doc.push(h2("Multiplicity"));
    for (const m of spec.multiplicity) {
      doc.push(bullet(`${m.family}: ${m.method}. ${m.note ?? ""}`));
    }
  }
  if (spec.missing_data) {
    doc.push(h2("Missing data"));
    doc.push(labelled("Expected mechanism:", spec.missing_data.expected_mechanism ?? "not stated"));
    doc.push(labelled("Primary handling:", spec.missing_data.primary_method ?? "not stated"));
    doc.push(labelled("Sensitivity:", spec.missing_data.sensitivity_method ?? "not stated"));
  }
  doc.push(h2("Reporting"));
  doc.push(bullet("Effect estimates are reported with 95% confidence intervals, not p-values alone."));
  doc.push(bullet("P-values are given to two decimal places, or to four when below 0.05."));
  doc.push(bullet(`Reporting follows the ${spec.study.guideline} statement.`));

  // ---- 7
  if (spec.sensitivity_analyses?.length) {
    doc.push(h1("Section 7. Sensitivity analyses"));
    doc.push(
      table(
        ["Analysis", "Purpose", "Method"],
        spec.sensitivity_analyses.map((s) => [s.label, s.purpose, s.method]),
      ),
    );
  }

  // ---- 8
  doc.push(h1("Section 8. Shell tables"));
  doc.push(para("The tables below are pre-specified and are provided in full as a separate document."));
  doc.push(
    table(
      ["Table", "Block", "Title", "Test applied"],
      [...spec.tables]
        .sort((a, b) => a.number - b.number)
        .map((t) => [`Table ${t.number}`, t.block, t.title, t.test_applied ?? "descriptive only"]),
    ),
  );

  if (spec.open_items?.length) {
    doc.push(h1("Section 9. Decisions still to be made"));
    for (const item of spec.open_items) {
      doc.push(bullet(`${item.question} (${item.owner})`));
    }
    doc.push(italic("This plan is not final while any decision above is unresolved."));
  }

  return toBuffer(doc);
}
