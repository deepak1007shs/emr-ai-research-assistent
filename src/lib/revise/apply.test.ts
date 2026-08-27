import { describe, expect, it } from "vitest";
import {
  applyCrfRevision,
  applySapRevision,
  applyTablesRevision,
  labelsFrom,
} from "./apply.ts";
import { validateSap } from "../sap/validate.ts";
import { validateCrf } from "../crf/validate.ts";
import { validateTables } from "../tables/validate.ts";
import { chooseTest } from "../sap/choose-test.ts";
import { sapFixture } from "../sap/fixture.ts";
import { crfFixture } from "../crf/fixture.ts";
import { tablesFixture } from "../tables/fixture.ts";

/**
 * A revision must not be able to buy its way out of the rules.
 *
 * The documents are linked by id, the test is chosen by code, and the wording
 * comes from one registry. An edit is the one place where a model could undo
 * any of that, so these hold each of them.
 */

const sap = () => structuredClone(sapFixture);
const crf = () => structuredClone(crfFixture);
const tables = () => structuredClone(tablesFixture);

const empty = { summary: "", needs_rebuild: false };

describe("revising the analysis plan", () => {
  it("replaces a variable in place, keeping its position", () => {
    const before = sap();
    const at = before.variables.findIndex((v) => v.id === "var_age");

    const { spec, changed } = applySapRevision(before, {
      ...empty,
      variable_edits: [
        {
          op: "upsert",
          id: "var_age",
          label: "Age at operation",
          data_type: "continuous",
          unit_coding: "Years",
          role: "confounder",
          exclusion_reason: "",
        },
      ],
    });

    expect(spec.variables[at].label).toBe("Age at operation");
    expect(spec.variables).toHaveLength(before.variables.length);
    expect(changed).toContain("var_age");
  });

  it("adds a variable that was not there", () => {
    const { spec } = applySapRevision(sap(), {
      ...empty,
      variable_edits: [
        {
          op: "upsert",
          id: "var_asa",
          label: "ASA grade",
          data_type: "ordinal",
          unit_coding: "I / II / III",
          role: "confounder",
          exclusion_reason: "",
        },
      ],
    });
    expect(spec.variables.map((v) => v.id)).toContain("var_asa");
  });

  it("removes one, and the validators catch what that broke", () => {
    // var_age is a predictor of S1. Removing it without removing the analysis
    // leaves a dangling reference, which is exactly what REF05 is for.
    const { spec } = applySapRevision(sap(), {
      ...empty,
      variable_edits: [
        {
          op: "remove", id: "var_age", label: "", data_type: "continuous",
          unit_coding: "", role: "confounder", exclusion_reason: "",
        },
      ],
    });

    expect(spec.variables.map((v) => v.id)).not.toContain("var_age");
    expect(validateSap(spec).findings.map((f) => f.code)).toContain("REF05");
  });

  it("cannot name a statistical test", () => {
    // The edit tries to smuggle one in under a field that does not exist.
    const { spec } = applySapRevision(sap(), {
      ...empty,
      analysis_edits: [
        {
          op: "upsert",
          objective_ids: ["P1"],
          label: "P1 - conversion rate",
          outcome_ids: ["out_conversion"],
          exposure_ids: [], adjust_for_ids: [],
          data_type: "binary",
          comparison: "single_group",
          pairing: "none" as const,
          skewed: false,
          table_ids: ["T1"],
          test: "Whatever I feel like",
        } as never,
      ],
    });

    const row = spec.analyses.find((a) => a.objective_ids.includes("P1"))!;
    expect(row).not.toHaveProperty("test", "Whatever I feel like");
    // The test still comes from the rule table.
    expect(chooseTest(row)?.unadjusted).toBe(chooseTest(sapFixture.analyses[0])?.unadjusted);
  });

  it("keeps an override the investigator recorded earlier", () => {
    const before = sap();
    before.analyses[0].test_override = "Firth logistic regression";
    before.analyses[0].override_reason = "Separation is expected at this event count.";

    const { spec } = applySapRevision(before, {
      ...empty,
      analysis_edits: [
        {
          op: "upsert", objective_ids: ["P1"], label: "P1 - conversion rate",
          outcome_ids: ["out_conversion"], exposure_ids: [], adjust_for_ids: [], data_type: "binary",
          comparison: "single_group", pairing: "none" as const, skewed: false, table_ids: ["T1"],
        },
      ],
    });

    expect(spec.analyses[0].test_override).toBe("Firth logistic regression");
    expect(spec.analyses[0].override_reason).toContain("Separation");
  });

  it("leaves the aim alone when the revision does not touch it", () => {
    const { spec } = applySapRevision(sap(), { ...empty, aim: "" });
    expect(spec.aim).toBe(sapFixture.aim);
  });
});

describe("revising the case report form", () => {
  const labels = labelsFrom(sapFixture);

  it("adds a field to the section it names", () => {
    const { spec } = applyCrfRevision(
      crf(),
      {
        ...empty,
        field_edits: [
          {
            op: "upsert",
            section_letter: "A",
            variable_id: "var_asa",
            label: "",
            type: "Single-select",
            options: ["I", "II", "III"],
            unit: "",
            note: "",
            primary_outcome: false,
          },
        ],
      },
      labels,
    );

    const section = spec.sections.find((s) => s.letter === "A")!;
    expect(section.fields.map((f) => f.variable_id)).toContain("var_asa");
  });

  it("removes a field, and the roll-call notices", () => {
    const { spec } = applyCrfRevision(
      crf(),
      {
        ...empty,
        field_edits: [
          {
            op: "remove", section_letter: "B", variable_id: "var_conversion",
            label: "", type: "Single-select", options: [], unit: "", note: "",
            primary_outcome: false,
          },
        ],
      },
      labels,
    );

    expect(validateCrf(spec).findings.map((f) => f.code)).toContain("ROLL05");
  });

  it("recopies the wording from the plan rather than trusting the edit", () => {
    const { spec } = applyCrfRevision(
      crf(),
      {
        ...empty,
        field_edits: [
          {
            op: "upsert", section_letter: "A", variable_id: "var_age",
            label: "Whatever the model felt like calling it",
            type: "Number", options: [], unit: "years", note: "", primary_outcome: false,
          },
        ],
      },
      labels,
    );

    // The stored label is ignored at render time: the registry decides.
    expect(spec.labels.var_age).toBe(sapFixture.variables.find((v) => v.id === "var_age")!.label);
  });

  it("puts a field with no section into the identifiers", () => {
    const { spec } = applyCrfRevision(
      crf(),
      {
        ...empty,
        field_edits: [
          {
            op: "upsert", section_letter: "", variable_id: "", label: "CR number",
            type: "Text", options: [], unit: "", note: "", primary_outcome: false,
          },
        ],
      },
      labels,
    );
    expect(spec.identifiers.map((f) => f.label)).toContain("CR number");
  });
});

describe("revising the shell tables", () => {
  const labels = labelsFrom(sapFixture);

  it("replaces a table whole and keeps them in number order", () => {
    const { spec, changed } = applyTablesRevision(
      tables(),
      {
        ...empty,
        table_edits: [
          {
            op: "upsert",
            number: 2,
            block: "descriptive",
            outcome_id: "",
            models: [],
            title: "Comorbidity by conversion status (n = 125)",
            role: "descriptive",
            columns: ["Variable", "Converted", "Completed", "P value"],
            rows: [
              { variable_id: "", label: "Diabetes mellitus", kind: "variable", heading: false, indent: false },
            ],
            test_applied: "Pearson chi-square test.",
            footnote: "",
          },
        ],
      },
      labels,
    );

    const numbers = spec.tables.map((t) => t.number);
    expect(numbers).toEqual([...numbers].sort((a, b) => a - b));
    expect(spec.tables.find((t) => t.number === 2)!.rows).toHaveLength(1);
    expect(changed).toContain("Table 2");
  });

  it("removing the tables the plan fills is caught", () => {
    // P1 is reported by a block, so removing one table of it leaves the others.
    // Removing all of them is what leaves the analysis with nowhere to print.
    const before = tables();
    const forP1 = before.tables.filter((t) => (t.fills ?? []).includes("P1"));
    const { spec } = applyTablesRevision(
      before,
      {
        ...empty,
        table_edits: forP1.map((t) => ({
          op: "remove" as const, number: t.number, block: "primary" as const,
          outcome_id: "", models: [], title: "", role: "summary" as const,
          columns: [], rows: [], test_applied: "", footnote: "",
        })),
      },
      labels,
    );

    expect(spec.tables.flatMap((t) => t.fills ?? [])).not.toContain("P1");
    // The plan still sends an analysis to T3, which no longer exists.
    const plan = structuredClone(sapFixture);
    expect(validateTables(spec, plan).findings.map((f) => f.code)).toContain("TBL14");
  });
});
