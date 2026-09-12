import { describe, expect, it } from "vitest";
import { idaPreg } from "../facts/fixture.ts";
import { elastography } from "../facts/fixture-diagnostic.ts";
import type { FactsSheet } from "../study/types.ts";
import { buildSap } from "../sap/build.ts";
import { buildFieldList, type FieldList } from "./fields.ts";

/**
 * C1 to C6: what the form captures, and why.
 *
 * The written process names the failure these guard against. A form drafted
 * from the protocol's own proforma rather than from the shell tables had no
 * visit dates, no tablet counts and no dietary pattern, and carried five items
 * no table uses. Both halves read as a finished form, which is why every test
 * here is a set operation and not a reading.
 */

const listOf = (facts: FactsSheet): FieldList => {
  const build = buildSap(facts);
  return buildFieldList({
    facts: build.facts,
    variables: build.variables,
    tables: build.tables,
    analysis: build.analysis,
    rules: build.rules,
  });
};

const list = listOf(idaPreg);
const build = buildSap(idaPreg);
const field = (name: string) => list.needs.find((need) => need.source === name);
const labelled = (label: string) => list.needs.filter((need) => need.label === label);

describe("not less", () => {
  it("captures every variable every shell table uses, at the visits it needs", () => {
    for (const table of build.tables) {
      if (table.fit_table_of) continue;
      for (const name of table.variables) {
        const variable = build.variables.find((v) => v.name === name)!;
        // A derived value reaches the form through its parts, which is the
        // next test. Everything else is captured under its own name.
        if (!variable.crf) continue;
        expect(field(name), `${name} for table ${table.number}`).toBeDefined();
      }
    }
  });

  it("captures a repeated measure at every visit it is measured at", () => {
    expect(field("haemoglobin")!.timepoints).toEqual(["D0", "W2", "W4", "W6"]);
    expect(field("serum_ferritin")!.timepoints).toEqual(["D0", "W6"]);
    expect(field("adverse_effects")!.timepoints).toEqual(["W2", "W4", "W6"]);
  });

  it("asks for the arm once, at randomisation, not at every visit the tables span", () => {
    // Table 3 reports haemoglobin across four visits and the arm is one of its
    // column groups. Taking the table's whole span as what it needs put the arm
    // on the form four times, and failed Gate C against a form that was right.
    expect(field("arm")!.timepoints).toEqual(["D0"]);
    expect(field("arm")!.needed).toEqual(["D0"]);
    expect(field("gestational_age")!.needed).toEqual(["D0"]);
  });

  it("adds a date at every visit, which is what a rate of change is fitted on", () => {
    // The process's own worked check fails its first draft here: Table 6 needs
    // the time of each reading and no protocol records that as a measure.
    const dates = labelled("Date of visit");
    expect(dates.map((d) => d.timepoints[0])).toEqual(["W2", "W4", "W6"]);
    expect(labelled("Date of enrolment (day 0)")).toHaveLength(1);

    const slope = build.tables.find((t) => t.kind === "rate_of_change")!;
    for (const date of [...dates, ...labelled("Date of enrolment (day 0)")]) {
      expect(date.traces).toContainEqual({ table: slope.number });
    }
  });

  it("asks at the last visit who finished the study", () => {
    // The plan's primary block opens with a population line and a flow from
    // screened to analysed. A form that never asks cannot fill either.
    const completion = labelled("Study completion status");
    expect(completion).toHaveLength(1);
    expect(completion[0].timepoints).toEqual(["W6"]);
    expect(completion[0].options).toEqual(["Completed", "Withdrew", "Lost to follow-up"]);
  });

  it("captures what defines a row that is written as a sentence", () => {
    // "The per-protocol set in place of the intention-to-treat set" is a row of
    // the sensitivity table and names no variable. Adherence is on the form
    // because of it, and for no other reason.
    const sensitivity = build.tables.find((t) => t.kind === "sensitivity")!;
    expect(field("adherence")!.traces).toEqual([{ table: sensitivity.number }]);
  });

  it("captures every adjustment covariate at the visit its model uses", () => {
    for (const row of build.analysis) {
      for (const covariate of row.adjusted?.covariates ?? []) {
        const variable = build.variables.find((v) => v.name === covariate.var)!;
        const captured = variable.crf
          ? field(covariate.var)
          : list.needs.find((n) => n.traces.some((t) => "via" in t && t.via === covariate.var));
        expect(captured, `${row.objective}: ${covariate.var}`).toBeDefined();
      }
    }
  });
});

describe("not extra, and nothing derived", () => {
  it("puts no derived value on the form, and captures its parts instead", () => {
    const derived = build.variables.filter((v) => !v.crf).map((v) => v.name);
    // Vacuous unless the worked example actually has some: it has four.
    expect(derived).toEqual([
      "bmi",
      "change_in_haemoglobin",
      "anaemia_corrected",
      "change_in_serum_ferritin",
    ]);
    for (const name of derived) expect(field(name), name).toBeUndefined();

    // Height and weight are on the form because Table 1 reports body mass
    // index, and neither of them appears in Table 1 under its own name.
    expect(field("height")!.traces).toContainEqual({ table: "1", via: "bmi" });
    expect(field("weight")!.traces).toContainEqual({ table: "1", via: "bmi" });
    // The change is computed from two readings, so both are captured.
    expect(field("haemoglobin")!.timepoints).toContain("D0");
    expect(field("haemoglobin")!.timepoints).toContain("W6");
  });

  it("gives every field a reason to be there", () => {
    for (const need of list.needs) {
      expect(need.traces.length, `${need.source} ${need.label ?? ""}`).toBeGreaterThan(0);
    }
  });

  it("drops nothing here, because Gate B already refuses a variable that reaches no table", () => {
    // The process's example drops education, blood group and three others. They
    // never become variables in this application: the reading's proforma triage
    // marks them keep: false, and S7-2 blocks the plan where one survives. The
    // list is kept for the case where it does not.
    expect(list.dropped).toEqual([]);
  });

  it("carries only the identifiers rule 5 names, and asks about the rest", () => {
    const infrastructure = list.needs.filter((n) => n.source === "infrastructure");
    const labels = infrastructure.map((n) => n.label);
    expect(labels).toContain("Subject study ID");
    expect(labels).toContain("Form completed by");
    // Not in the skill's five kinds, so not invented here: the house form has
    // them and this one does not.
    expect(labels).not.toContain("Date of written informed consent");
    expect(labels).not.toContain("Randomisation number");
    expect(labels).not.toContain("Visit status");
    expect(labels.join(" ")).not.toContain("Signature");
    expect(list.todos.join(" ")).toContain("hospital number");
  });
});

describe("other study shapes", () => {
  it("captures the index tests and the grade the reference standard is read from", () => {
    const diagnostic = listOf(elastography);
    const sources = diagnostic.needs.map((n) => n.source);
    for (const name of ["ratio_mean", "ratio_max", "stiffness_mean", "stiffness_max", "bethesda"]) {
      expect(sources, name).toContain(name);
    }

    // The target condition is a grade cut in two - "Bethesda V or VI", as a
    // Gleason score is cut at clinical significance - so it is derived, and a
    // derived value is not a field. What the pathologist writes down is the
    // category; malignant is computed from it at analysis.
    const target = buildSap(elastography).variables.find((v) => v.name === "malignant")!;
    expect(target.crf).toBe(false);
    expect(target.derived_from).toEqual(["bethesda"]);
    expect(sources).not.toContain("malignant");
    expect(diagnostic.needs.find((n) => n.source === "bethesda")!.traces).toContainEqual({
      table: "3",
      via: "malignant",
    });

    // One reading per nodule, at the visit each is taken.
    expect(diagnostic.needs.find((n) => n.source === "bethesda")!.timepoints).toEqual(["T1"]);
    expect(diagnostic.needs.find((n) => n.source === "ratio_mean")!.timepoints).toEqual(["T0"]);
  });

  it("builds the same list twice", () => {
    expect(JSON.stringify(listOf(idaPreg))).toBe(JSON.stringify(list));
  });
});
