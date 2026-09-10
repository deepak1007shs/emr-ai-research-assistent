import { describe, expect, it } from "vitest";
import { buildAnalyticTables, mergeTables } from "./blocks.ts";
import { assignSlots } from "./slots.ts";
import { validateTables } from "./validate.ts";
import type { SapRegistry } from "../sap/types.ts";
import type { ShellTablesSpec, TableRole } from "./types.ts";

/**
 * The trial that showed the old model up.
 *
 * A two-arm trial with a common binary primary outcome. Asked to lay this out,
 * the model produced one table with one row reporting an odds ratio, which is
 * the estimate the rule table names as the thing to avoid for a common outcome.
 * Everything needed to lay it out correctly was already in the plan.
 *
 * It later showed the code up too. The plan produced the right estimates and
 * put them three tables away from the counts they were computed from: the
 * whole-cohort count, then the same count by arm, then the estimates. Those
 * three are now one table, which is what the rest of this file checks.
 */
function peep(): SapRegistry {
  return {
    title: "PEEP 7 versus PEEP 5 during delivery room resuscitation",
    sample_size: 100,
    expected_events: 40,
    objectives: [
      {
        id: "P1",
        tier: "primary",
        question: "Does a PEEP of 7 reduce delivery room intubation compared with a PEEP of 5?",
      },
    ],
    variables: [
      {
        id: "var_peep",
        label: "Allocated PEEP level",
        data_type: "binary",
        unit_coding: "PEEP 7 cm H2O / PEEP 5 cm H2O",
        role: "predictor",
      },
      { id: "var_ga", label: "Gestational age stratum", data_type: "ordinal", unit_coding: "Weeks", role: "confounder" },
      { id: "var_mode", label: "Mode of delivery", data_type: "binary", unit_coding: "Vaginal / Caesarean", role: "confounder" },
      { id: "var_bw", label: "Birth weight", data_type: "continuous", unit_coding: "Grams", role: "confounder" },
    ],
    outcomes: [
      {
        id: "out_intubation",
        what: "Delivery room intubation within the first 20 minutes of life",
        how: "the resuscitation record",
        instrument: "proforma",
        when: "20 minutes of life",
        units: "Yes / No",
        domain: "clinical",
        source_variable_ids: ["var_peep"],
      },
    ],
    analyses: [
      {
        objective_ids: ["P1"],
        label: "P1 - delivery room intubation",
        outcome_ids: ["out_intubation"],
        exposure_ids: ["var_peep"],
        adjust_for_ids: ["var_ga", "var_mode", "var_bw"],
        data_type: "binary",
        comparison: "two_groups",
        pairing: "none",
        frequency: "common",
        table_ids: ["T1"],
      },
    ],
    populations: [
      { name: "Intention to treat (primary)", definition: "Every randomised infant, in the arm allocated." },
      { name: "Per protocol", definition: "Infants who received the allocated PEEP throughout." },
    ],
    subgroups: [
      { subgroup: "Gestational age under 28 weeks", how_tested: "An interaction term." },
      { subgroup: "Mode of delivery", how_tested: "An interaction term." },
    ],
    rules: {
      software: "R",
      normality: "Shapiro-Wilk.",
      continuous_summary: "Mean (SD).",
      categorical_summary: "n (%).",
      significance: "Two sided, p < 0.05.",
      effect_estimates: "Every estimate with a 95% confidence interval.",
      missing_data: "Complete case, with a best case and worst case tipping point analysis.",
      multiplicity: "The primary outcome is confirmatory.",
      reproducibility: "A fixed seed.",
    },
  };
}

const groups = ["PEEP 7 cm H2O", "PEEP 5 cm H2O"];
const build = () => buildAnalyticTables(peep(), groups);
const roleOf = (role: TableRole) => build().find((t) => t.role === role)!;

const spec = (): ShellTablesSpec => {
  const sap = peep();
  const described = [
    {
      number: 0,
      block: "descriptive" as const,
      role: "descriptive" as const,
      slot: "A1",
      title: "Maternal and antenatal characteristics by allocated PEEP level (n = 100)",
      columns: ["Variable", ...groups, "Total", "P value"],
      rows: [{ variable_id: "var_ga", label: "Gestational age stratum", kind: "variable" as const }],
      test_applied: "Pearson chi-square test.",
    },
  ];
  // Ordered, numbered and slotted the way the real pipeline does it, so a test
  // cannot pass on a document nobody would ever be handed.
  return {
    title: "PEEP",
    labels: {},
    groups,
    tables: assignSlots(
      mergeTables(described, buildAnalyticTables(sap, groups), sap),
      sap.objectives.map((o) => o.id),
    ),
  };
};

describe("the tables a primary outcome gets", () => {
  it("is one table for the outcome, and one each for the other shapes", () => {
    // The outcome whole, then the adjusted model whose rows are the
    // confounders, then the subgroup table whose rows are the subgroups, then
    // the sensitivity table whose rows are the analysis populations. Nothing
    // here is a fragment of anything else.
    expect(build().map((t) => t.role)).toEqual([
      "outcome",
      "effect_adjusted",
      "subgroup",
      "sensitivity",
    ]);
    expect(build().find((t) => t.role === "subgroup")!.block).toBe("exploratory");
  });

  it("puts the arms across the top and the outcome down the side", () => {
    const table = roleOf("outcome");
    expect(table.block).toBe("primary");
    // Each arm heads its column with what the cells under it hold, as the
    // house documents head them.
    expect(table.columns.slice(0, 4)).toEqual([
      "Outcome",
      "PEEP 7 cm H2O - n (%)",
      "PEEP 5 cm H2O - n (%)",
      "Total",
    ]);
    expect(table.rows.map((r) => r.label)).toEqual([
      "Delivery room intubation within the first 20 minutes of life",
    ]);
  });

  it("carries the estimates in the same table as the counts", () => {
    // This is the whole point. The estimates used to be a table of their own,
    // a page away from the numbers they were computed from.
    const table = roleOf("outcome");
    expect(table.columns).toEqual([
      "Outcome",
      "PEEP 7 cm H2O - n (%)",
      "PEEP 5 cm H2O - n (%)",
      "Total",
      "Risk ratio (95% CI)",
      "Risk difference (95% CI)",
      "Number needed to treat (95% CI)",
      "P value",
    ]);
  });

  it("says what fills a cell, which a column header no longer can", () => {
    // The wording is the rule table's, so the cell statistic and the test under
    // it come from one source and cannot contradict each other.
    const table = roleOf("outcome");
    expect(table.reported_as).toBeTruthy();
    expect(table.reported_as).toMatch(/n\s*\(%\)/i);
  });

  it("prints the estimates the rule table chose, and never an odds ratio", () => {
    const table = roleOf("outcome");
    expect([...table.columns, ...table.rows.map((r) => r.label)].join(" ")).not.toMatch(
      /odds ratio/i,
    );
    // Only the footnote may mention one, and only to rule it out.
    expect(table.footnote).toContain("odds ratio");
  });

  it("keeps the whole-cohort count, as a column rather than a table", () => {
    // It used to open the block as a table of its own. A reader still needs it,
    // because a difference cannot be judged without the quantity it is a
    // difference in, but it does not need a page.
    expect(roleOf("outcome").columns).toContain("Total");
    expect(roleOf("outcome").footnote).toContain("before it is split");
    expect(build().some((t) => t.role === "distribution")).toBe(false);
  });

  it("puts the crude and the adjusted estimate on one row, per predictor", () => {
    const table = roleOf("effect_adjusted");
    expect(table.columns).toEqual([
      "Predictor",
      "Unadjusted risk ratio (95% CI)",
      "P value",
      "Adjusted risk ratio (95% CI)",
      "P value",
    ]);
    expect(table.models).toEqual([
      { name: "Adjusted", adds: ["var_ga", "var_mode", "var_bw"] },
    ]);
    expect(table.columns.join(" ")).not.toMatch(/Model\s*\d/);
    // The predictors are the rows, named by id so the wording comes from the plan.
    expect(table.rows.map((r) => r.variable_id)).toEqual([
      "var_peep",
      "var_ga",
      "var_mode",
      "var_bw",
    ]);
    expect(table.footnote).toContain("holds constant");
    expect(table.footnote).toContain("ten events per degree of freedom");
  });

  it("reads effect modification from an interaction, not a within-subgroup p", () => {
    const table = roleOf("subgroup");
    expect(table.columns).toContain("Interaction p");
    expect(table.rows.map((r) => r.label)).toEqual([
      "Gestational age under 28 weeks",
      "Mode of delivery",
    ]);
    expect(table.footnote).toContain("not powered");
  });

  it("repeats the primary analysis every way the plan said it would", () => {
    const labels = roleOf("sensitivity").rows.map((r) => r.label);
    expect(labels[0]).toContain("Intention to treat");
    expect(labels).toContain("Per protocol");
    expect(labels).toContain("Adjusted estimate, against the unadjusted");
    expect(labels.some((l) => l.includes("tipping point"))).toBe(true);
  });

  it("passes its own guards", () => {
    const { findings } = validateTables(spec(), peep());
    expect(
      findings.filter((f) => f.severity === "ERROR"),
      JSON.stringify(findings, null, 2),
    ).toEqual([]);
  });

  it("TBL20 - an odds ratio planted on a common outcome is caught", () => {
    const s = spec();
    const table = s.tables.find((t) => t.role === "outcome")!;
    table.columns = [...table.columns, "Odds ratio (95% CI)"];
    const findings = validateTables(s, peep()).findings;
    expect(findings.map((f) => f.code)).toContain("TBL20");
    expect(findings.find((f) => f.code === "TBL20")?.message).toContain("overstates the effect");
  });

  it("TBL29 - a merged table that lost its estimates is caught", () => {
    // The merge is only worth anything if both halves are there.
    const s = spec();
    const table = s.tables.find((t) => t.role === "outcome")!;
    table.columns = ["Outcome", ...groups, "Total"];
    const findings = validateTables(s, peep()).findings;
    expect(findings.map((f) => f.code)).toContain("TBL29");
  });

  it("TBL29 - a merged table that lost its counts is caught", () => {
    const s = spec();
    const table = s.tables.find((t) => t.role === "outcome")!;
    table.columns = ["Outcome", "Risk ratio (95% CI)", "P value"];
    const findings = validateTables(s, peep()).findings;
    expect(findings.find((f) => f.code === "TBL29")?.message).toContain("computed from");
  });
});

/**
 * The other way round.
 *
 * "What predicts surgical site infection?" is still a comparison, but it groups
 * by the outcome rather than by an exposure, so every candidate predictor is a
 * row. Laid out the first way, this study got one table per predictor.
 */
function predictorHunt(): SapRegistry {
  const variable = (id: string, label: string, data_type: SapRegistry["variables"][number]["data_type"]) => ({
    id,
    label,
    data_type,
    unit_coding: data_type === "continuous" ? "Years" : "Yes / No",
    role: "predictor" as const,
  });

  return {
    title: "Predictors of surgical site infection following emergency laparotomy",
    design_family: "cohort",
    sample_size: 120,
    expected_events: 30,
    objectives: [
      { id: "P1", tier: "primary", intent: "causal", question: "Which factors independently predict surgical site infection within 30 days?" },
    ],
    variables: [
      variable("var_sex", "Sex", "binary"),
      variable("var_dm", "Diabetes mellitus", "binary"),
      variable("var_asa", "ASA physical status grade", "ordinal"),
      variable("var_age", "Age", "continuous"),
      variable("var_albumin", "Serum albumin", "continuous"),
    ],
    outcomes: [
      {
        id: "out_ssi",
        what: "Surgical site infection within 30 days of surgery",
        how: "wound assessment",
        instrument: "proforma",
        when: "30 days",
        units: "Binary (Yes/No)",
        domain: "clinical",
        source_variable_ids: ["var_sex"],
      },
    ],
    analyses: [
      {
        objective_ids: ["P1"],
        label: "P1 - predictors of infection",
        outcome_ids: ["out_ssi"],
        exposure_ids: ["var_sex", "var_dm", "var_asa", "var_age", "var_albumin"],
        adjust_for_ids: ["var_age", "var_sex", "var_asa"],
        data_type: "binary",
        comparison: "association",
        pairing: "none",
        frequency: "common",
        table_ids: ["T1"],
      },
    ],
    populations: [{ name: "Full analysis set", definition: "Every patient operated on." }],
    subgroups: [],
    rules: {
      software: "SPSS",
      normality: "Shapiro-Wilk.",
      continuous_summary: "Mean (SD).",
      categorical_summary: "n (%).",
      significance: "Two sided, p < 0.05.",
      effect_estimates: "Every estimate with a 95% confidence interval.",
      missing_data: "Complete case under 5%, multiple imputation otherwise.",
      multiplicity: "The primary outcome is confirmatory.",
      reproducibility: "A fixed seed.",
    },
  };
}

describe("a study hunting predictors", () => {
  const built = () => buildAnalyticTables(predictorHunt(), ["Infected", "Not infected"]);

  it("puts every candidate predictor in a row, not in a table of its own", () => {
    const tables = built().filter((t) => t.role === "predictors");
    expect(tables).toHaveLength(2);
    const rows = tables.flatMap((t) => t.rows.map((r) => r.variable_id));
    expect(rows).toEqual([
      "var_sex",
      "var_dm",
      "var_asa",
      "var_age",
      "var_albumin",
    ]);
  });

  it("splits categorical from numerical, because the cell and the test differ", () => {
    const [categorical, numerical] = built().filter((t) => t.role === "predictors");

    expect(categorical.rows.map((r) => r.variable_id)).toEqual(["var_sex", "var_dm", "var_asa"]);
    expect(categorical.reported_as).toContain("n (%)");

    expect(numerical.rows.map((r) => r.variable_id)).toEqual(["var_age", "var_albumin"]);
    expect(numerical.reported_as).toMatch(/mean|median/i);

    // Each test is the rule table's own choice for what that table compares,
    // and the two must not be the same: it is the reason there are two tables.
    expect(categorical.test_applied).toBeTruthy();
    expect(numerical.test_applied).toBeTruthy();
    expect(categorical.test_applied).not.toBe(numerical.test_applied);
    expect(numerical.test_applied).toMatch(/t-test|Mann-Whitney/i);
  });

  it("groups by the outcome, and carries the crude estimate beside the counts", () => {
    const [categorical] = built().filter((t) => t.role === "predictors");
    expect(categorical.columns).toEqual([
      "Variable",
      "Present",
      "Absent",
      "Crude risk ratio per unit (95% CI)",
      "P value",
    ]);
  });

  it("says no variable is dropped on its p value alone", () => {
    const [categorical] = built().filter((t) => t.role === "predictors");
    expect(categorical.footnote).toContain("No variable is dropped here");
  });

  it("still gets its adjusted model, whose rows are the confounders", () => {
    const adjusted = built().find((t) => t.role === "effect_adjusted")!;
    expect(adjusted.models).toEqual([{ name: "Adjusted", adds: ["var_age", "var_sex", "var_asa"] }]);
  });

  it("passes its own guards", () => {
    const sap = predictorHunt();
    const groups = ["Infected", "Not infected"];
    const spec: ShellTablesSpec = {
      title: sap.title,
      labels: Object.fromEntries([
        ...sap.variables.map((v) => [v.id, v.label]),
        ...sap.outcomes.map((o) => [o.id, o.what]),
      ]),
      groups,
      tables: assignSlots(
        mergeTables(
          [
            {
              number: 0,
              block: "descriptive" as const,
              role: "descriptive" as const,
              slot: "A1",
              title: "Demographic characteristics of the study population (n = 120)",
              columns: ["Variable", "n", "%"],
              rows: [{ variable_id: "var_sex", label: "Sex", kind: "variable" as const }],
            },
          ],
          buildAnalyticTables(sap, groups),
          sap,
        ),
        sap.objectives.map((o) => o.id),
      ),
    };
    const { findings } = validateTables(spec, sap);
    expect(
      findings.filter((f) => f.severity === "ERROR"),
      JSON.stringify(findings, null, 2),
    ).toEqual([]);
  });
});

describe("a plan that disagrees with itself", () => {
  it("TBL30 - the outcome is marked skewed and the plan names a mean", () => {
    // Naveen's length of stay carries skewed: true and a mean difference. The
    // table is where it becomes visible, because the cell says median and the
    // line under it says mean.
    const sap = peep();
    const analysis = sap.analyses[0];
    analysis.data_type = "continuous";
    analysis.skewed = true;
    analysis.measures = ["Mean difference"];
    analysis.test = "Group means (SD) and the crude mean difference";

    const groups = ["PEEP 7 cm H2O", "PEEP 5 cm H2O"];
    const spec: ShellTablesSpec = {
      title: sap.title,
      labels: {},
      groups,
      tables: assignSlots(
        mergeTables([], buildAnalyticTables(sap, groups), sap),
        sap.objectives.map((o) => o.id),
      ),
    };
    const findings = validateTables(spec, sap).findings;
    const flagged = findings.find((f) => f.code === "TBL30");
    expect(flagged?.severity).toBe("WARN");
    expect(flagged?.message).toContain("median");
  });
});

/**
 * Three faults one real trial's document showed and no fixture had.
 *
 * The plan for an incisional-NPWT trial laid out sixteen tables where fourteen
 * were wanted: four of them were verbatim copies of earlier tables, one was an
 * empty grid with no title, and every analytic title named the treatment group
 * twice. All three are the deterministic half of the layout, so all three are
 * fixed here rather than asked of a model.
 */
describe("the layout of a two-arm trial", () => {
  /** The same analysis serving a primary objective and an exploratory one. */
  function alsoExploratory(): SapRegistry {
    const sap = peep();
    sap.objectives.push({
      id: "E1",
      tier: "exploratory",
      question: "Does the effect of PEEP on intubation hold in the smallest infants?",
    });
    sap.analyses.push({ ...sap.analyses[0], objective_ids: ["E1"], label: "E1 - the same again" });
    return sap;
  }

  it("says what the comparison is once, not twice", () => {
    // Two analyses of one outcome by one exposure, differing in something the
    // title cannot show. Their titles collide, so the disambiguator appends
    // what they compare - to a title that already opened by naming it.
    // The pair that produced it: one crude comparison and one adjusted, of the
    // same outcome by the same exposure. Their outcome tables share a title, so
    // the disambiguator reaches for what they compare - which the title opened
    // by naming.
    const sap = peep();
    sap.analyses.push({
      ...sap.analyses[0],
      label: "P1 - the same outcome, adjusted",
      comparison: "adjusted",
    });

    const tables = mergeTables([], buildAnalyticTables(sap, ["PEEP 7", "PEEP 5"]), sap);
    for (const table of tables) {
      const said = table.title.toLowerCase().split("allocated peep level").length - 1;
      expect(said, table.title).toBeLessThanOrEqual(1);
    }
  });

  it("lays one analysis out once, however many objectives it serves", () => {
    const sap = alsoExploratory();
    const tables = mergeTables([], buildAnalyticTables(sap, ["PEEP 7", "PEEP 5"]), sap);

    const shapes = tables.map((t) =>
      JSON.stringify([t.role, t.outcome_id ?? null, t.columns, t.rows]),
    );
    expect(new Set(shapes).size, "two tables share a grid").toBe(shapes.length);
  });

  it("and keeps both objectives pointing at the table that answers them", () => {
    // Dropped rather than merged, the exploratory objective would report
    // nothing and TBL14 would say so. The reader needs one table, not none.
    const sap = alsoExploratory();
    const tables = mergeTables([], buildAnalyticTables(sap, ["PEEP 7", "PEEP 5"]), sap);
    const fills = new Set(tables.flatMap((t) => t.fills ?? []));
    expect(fills).toContain("P1");
    expect(fills).toContain("E1");
  });

  it("reports a result for the objective that owns it, not the exploratory one", () => {
    const sap = alsoExploratory();
    const tables = mergeTables([], buildAnalyticTables(sap, ["PEEP 7", "PEEP 5"]), sap);
    const merged = tables.find((t) => (t.fills ?? []).includes("E1") && (t.fills ?? []).includes("P1"));
    expect(merged?.block, "a primary result is not an exploratory finding").toBe("primary");
  });

  it("qualifies a title only against a table that still exists", () => {
    // The duplicate was removed after the titles were settled, so every table
    // of one trial explained that it reported "a continuous measure" - telling
    // it apart from a table that had already been merged away.
    const sap = alsoExploratory();
    const tables = mergeTables([], buildAnalyticTables(sap, ["PEEP 7", "PEEP 5"]), sap);
    for (const table of tables) {
      expect(table.title, table.title).not.toContain("as a proportion");
    }
  });

  it("keeps the study's denominator out of an analytic title", () => {
    // It was on every one of them. The study total is not the denominator of a
    // table comparing two arms, and the house documents put the denominator in
    // the column headings, per group, where it is true.
    const tables = mergeTables([], buildAnalyticTables(peep(), ["PEEP 7", "PEEP 5"]), peep());
    for (const table of tables.filter((t) => t.role !== "flow")) {
      expect(table.title, table.title).not.toMatch(/\(n\s*=/);
    }
  });

  it("prints no table for an empty grid", () => {
    // A model supplied a descriptive block with no title, no columns and no
    // rows. It printed as "Table 2." with nothing under it, and took a number
    // from every table after it.
    const empty = {
      number: 0,
      block: "descriptive" as const,
      role: "descriptive" as TableRole,
      title: "",
      columns: [],
      rows: [],
    };
    const tables = mergeTables([empty], buildAnalyticTables(peep(), ["PEEP 7", "PEEP 5"]), peep());
    expect(tables.some((t) => !t.columns.length && !t.rows.length)).toBe(false);
    expect(tables.map((t) => t.number)).toEqual(tables.map((_, i) => i + 1));
  });
});

/**
 * Two faults a real plan's own wording produced.
 *
 * A plan records what the protocol left unresolved on the row it affects, and
 * one row's note ran to eighty words. It reached the shell tables as a title.
 */
describe("a title taken from the plan's own wording", () => {
  it("carries none of the reviewer's note", () => {
    const sap = peep();
    sap.analyses[0].label =
      "P1 - delivery room intubation (NOTE: no diagnostic criterion is stated in the protocol; it must be defined before data collection)";
    sap.analyses[0].outcome_ids = [];

    const tables = mergeTables([], buildAnalyticTables(sap, ["PEEP 7", "PEEP 5"]), sap);
    for (const table of tables) {
      expect(table.title, table.title).not.toContain("NOTE");
      expect(table.title, table.title).not.toContain("must be defined");
    }
  });

  it("tells the unadjusted table apart from the adjusted one", () => {
    // A trial reported its primary outcome unadjusted, and again adjusted for
    // four variables under an exploratory objective. Same outcome, same
    // exposure, same data type: neither the data type nor the comparison told
    // the two titles apart, and a reader citing one cited both.
    const sap = peep();
    sap.objectives.push({
      id: "E1",
      tier: "exploratory",
      question: "Do the confounders modify the effect of PEEP on intubation?",
    });
    // A continuous, skewed outcome, as the trial that showed this had: the
    // crude analysis reports a median difference and the adjusted one a mean
    // difference, so the two tables differ in shape and both survive.
    sap.analyses[0].adjust_for_ids = [];
    sap.analyses[0].comparison = "two_groups";
    sap.analyses[0].data_type = "continuous";
    sap.analyses[0].skewed = true;
    sap.analyses.push({
      ...sap.analyses[0],
      objective_ids: ["E1"],
      label: "E1 - the same outcome, holding the confounders constant",
      comparison: "adjusted",
      adjust_for_ids: ["var_ga", "var_mode", "var_bw"],
    });

    const tables = mergeTables([], buildAnalyticTables(sap, ["PEEP 7", "PEEP 5"]), sap);
    const titles = tables.map((t) => t.title);
    expect(new Set(titles).size, titles.join(" | ")).toBe(titles.length);

    // And it is the adjustment that tells them apart, since nothing else about
    // them differs: same outcome, same exposure, same data type.
    const outcomes = tables.filter((t) => t.role === "outcome");
    expect(outcomes.length, "the two tables merged, so nothing is being told apart").toBe(2);
    expect(outcomes.some((t) => t.title.includes("unadjusted"))).toBe(true);
    expect(outcomes.some((t) => t.title.includes("adjusted for"))).toBe(true);
  });
});
