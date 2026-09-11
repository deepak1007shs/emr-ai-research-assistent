import { describe, expect, it } from "vitest";
import { idaPreg } from "../facts/fixture.ts";
import type { FactsSheet } from "../study/types.ts";
import { buildObjectives } from "../objectives/build.ts";
import { buildVariables } from "../variables/build.ts";
import { buildExploratory } from "../variables/exploratory.ts";
import { buildAnalysis } from "../analysis/build.ts";
import { assumptionFor, buildRules } from "./build.ts";
import { step5Checks } from "./checks.ts";

const parts = (facts: FactsSheet = idaPreg) => {
  const objectives = buildObjectives(facts);
  const { variables } = buildVariables(facts, objectives);
  const { outcomes } = buildExploratory(facts, objectives, variables);
  const { rows } = buildAnalysis(facts, objectives, variables, outcomes);
  return { objectives, rows, ...buildRules(facts, objectives, rows) };
};

describe("Step 5, the rules", () => {
  it("gives a trial three populations and an observational study one", () => {
    expect(parts().rules.populations.map((p) => p.name)).toEqual([
      "Intention to treat", "Per protocol", "Safety set",
    ]);
    const cohort: FactsSheet = { ...idaPreg, design: "cohort" };
    expect(parts(cohort).rules.populations.map((p) => p.name)).toEqual([
      "Analysis cohort",
    ]);
  });

  it("never promises intention to treat where nothing was assigned", () => {
    const cohort: FactsSheet = { ...idaPreg, design: "cohort" };
    const text = JSON.stringify(parts(cohort).rules);
    expect(text).not.toContain("ntention to treat");
  });

  it("sends the safety outcome to the safety set and the rest to ITT", () => {
    const [itt, , safety] = parts().rules.populations;
    expect(itt.definition).toContain("P1a, P1b, S1, S2");
    expect(itt.definition).not.toContain("S3");
    expect(safety.definition).toContain("S3");
  });

  it("keeps the exploratory questions out of the efficacy set", () => {
    expect(parts().rules.populations[0].definition).not.toContain("E1");
  });

  it("writes the house default and marks it where the protocol is silent", () => {
    expect(parts().rules.alpha).toBe("0.05");
    expect(parts().rules.software).toContain("**TODO:**");
    expect(parts().todos.join(" ")).toContain("version");
  });

  it("uses what the protocol states, in place of the default", () => {
    const stated: FactsSheet = {
      ...idaPreg,
      stated_rules: {
        ...idaPreg.stated_rules,
        software: "SPSS version 27",
        alpha: "0.01",
        sided: "one",
      },
    };
    expect(parts(stated).rules.software).toBe("SPSS version 27");
    expect(parts(stated).rules.multiplicity.primary).toContain("0.01, one-sided");
    expect(parts(stated).todos.join(" ")).not.toContain("version");
  });

  it("orders two primary questions rather than splitting alpha between them", () => {
    expect(parts().rules.multiplicity.primary).toContain("P1a then P1b");
    expect(parts().rules.multiplicity.primary).toContain("fixed sequence");
  });

  it("gives one primary question a plain alpha and no sequence", () => {
    const oneShot: FactsSheet = {
      ...idaPreg,
      primary: { ...idaPreg.primary, time: ["D0", "W6"] },
    };
    expect(parts(oneShot).rules.multiplicity.primary).toBe(
      "Alpha of 0.05, two-sided, for P1.",
    );
  });

  it("refuses to correct a safety signal away", () => {
    expect(parts().rules.multiplicity.safety).toContain(
      "whether or not it reaches significance",
    );
  });

  it("says no interim analysis rather than saying nothing", () => {
    expect(parts().rules.interim).toBe("No interim analysis is planned.");
  });

  it("forbids carrying the last observation forward, and says why", () => {
    expect(parts().rules.missing_data).toContain("never carried forward");
    expect(parts().rules.missing_data).toContain("stopped changing");
  });

  it("puts the per-protocol set in the sensitivity rows of a trial only", () => {
    expect(parts().rules.sensitivity_rows.join(" ")).toContain("per-protocol");
    const cohort: FactsSheet = { ...idaPreg, design: "cohort" };
    expect(parts(cohort).rules.sensitivity_rows.join(" ")).not.toContain(
      "per-protocol",
    );
  });

  it("adds the alternative-definition row only where a cut-off is open", () => {
    expect(parts().rules.sensitivity_rows.join(" ")).toContain(
      "alternative outcome definition",
    );
    const settled: FactsSheet = { ...idaPreg, open_items: [] };
    expect(parts(settled).rules.sensitivity_rows.join(" ")).not.toContain(
      "alternative outcome definition",
    );
  });

  it("finds the assumption row for a model by its name", () => {
    expect(assumptionFor("Log-binomial regression")!["If it fails"]).toContain(
      "Modified Poisson",
    );
    expect(
      assumptionFor("Linear mixed model with a group-by-time term")!.Reported,
    ).toContain("intraclass correlation");
  });

  it("prefers the specific assumption row to the general one", () => {
    // "Log-binomial regression" contains "regression" too, and the general
    // linear-regression row would name the wrong diagnostics entirely.
    expect(assumptionFor("Log-binomial regression")!.Key).toBe("log-binomial");
  });
});

describe("Step 5 checks", () => {
  it("passes every check on the worked example", () => {
    const { objectives, rules } = parts();
    expect(step5Checks(objectives, rules).filter((r) => !r.pass)).toEqual([]);
  });

  it("S5-1 catches an objective on no defined set", () => {
    const { objectives, rules } = parts();
    const stripped = {
      ...rules,
      populations: rules.populations.map((p) => ({
        ...p,
        definition: p.definition.replace("S2", ""),
      })),
    };
    expect(step5Checks(objectives, stripped).find((r) => r.id === "S5-1")!.failing)
      .toEqual(["S2"]);
  });

  it("S5-2 catches a family with no multiplicity line", () => {
    const { objectives, rules } = parts();
    const stripped = { ...rules, multiplicity: { primary: rules.multiplicity.primary } };
    const result = step5Checks(objectives, stripped).find((r) => r.id === "S5-2")!;
    expect(result.pass).toBe(false);
    expect(result.failing).toEqual(["secondary", "exploratory"]);
  });

  it("S5-3 catches silence about interim analysis", () => {
    const { objectives, rules } = parts();
    expect(
      step5Checks(objectives, { ...rules, interim: "" }).find((r) => r.id === "S5-3")!
        .pass,
    ).toBe(false);
  });
});
