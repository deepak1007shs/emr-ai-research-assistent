import { describe, expect, it } from "vitest";
import { idaPreg } from "../facts/fixture.ts";
import { buildObjectives } from "../objectives/build.ts";
import { buildVariables } from "./build.ts";
import { step3Checks } from "./checks.ts";
import { buildExploratory } from "./exploratory.ts";

const run = (facts = idaPreg) => {
  const objectives = buildObjectives(facts);
  const { variables } = buildVariables(facts, objectives);
  const exploratory = buildExploratory(facts, objectives, variables);
  return { variables, ...exploratory };
};

describe("Step 3, the exploratory questions", () => {
  it("resolves one per idea, in order, keeping the protocol's words", () => {
    const { outcomes } = run();
    expect(outcomes.map((o) => o.id)).toEqual(["E1", "E2", "E3"]);
    expect(outcomes[1].kind).toBe("correlation");
    expect(outcomes[1].question).toContain("baseline serum ferritin");
  });

  it("reuses what the study already collects, without promoting it", () => {
    const { outcomes } = run();
    expect(outcomes[0].reuses).toEqual([
      "change_in_haemoglobin",
      "gestational_age",
    ]);
    expect(outcomes[0].promoted).toBeNull();
  });

  it("promotes the variable the protocol asks about and never collects", () => {
    // The failure this exists to catch: the hypothesis names dietary pattern,
    // no visit records it, and without promotion the question is lost before
    // the first participant is enrolled.
    const { outcomes, variables } = run();
    expect(outcomes[2].promoted).toEqual({
      variable: "diet",
      reason: "Named by E3 and recorded at no visit of the protocol's schedule.",
    });
    const diet = variables.find((v) => v.name === "diet")!;
    expect(diet.source).toBe("promoted");
    expect(diet.crf).toBe(true);
    expect(diet.timepoints).toEqual(["D0"]);
  });

  it("asks the investigator before adding work to every visit", () => {
    expect(run().todos.join(" ")).toContain("Confirm the categories, or drop the question");
  });

  it("does not promote a variable that is derived from collected ones", () => {
    const facts = {
      ...idaPreg,
      exploratory_ideas: [
        {
          question: "Whether the change in ferritin tracks the change in haemoglobin",
          kind: "correlation" as const,
          outcome_of: "change_in_haemoglobin",
          with: ["change_in_serum_ferritin"],
        },
      ],
    };
    const { outcomes, variables } = run(facts);
    expect(outcomes[0].promoted).toBeNull();
    expect(variables.find((v) => v.name === "change_in_serum_ferritin")!.crf).toBe(false);
  });

  it("S3-1 passes on the worked example", () => {
    const { variables, outcomes } = run();
    expect(step3Checks(variables, outcomes)[0].pass).toBe(true);
  });

  it("S3-1 catches a question about a variable nothing lists", () => {
    const { variables, outcomes } = run();
    const broken = outcomes.map((o, i) =>
      i === 0 ? { ...o, reuses: ["serum_hepcidin"] } : o,
    );
    const result = step3Checks(variables, broken)[0];
    expect(result.pass).toBe(false);
    expect(result.failing).toEqual(["E1: serum_hepcidin"]);
  });

  it("S3-1 catches a field added to the form with no reason recorded", () => {
    const { variables, outcomes } = run();
    const silent = outcomes.map((o) => ({ ...o, promoted: null }));
    const result = step3Checks(variables, silent)[0];
    expect(result.pass).toBe(false);
    expect(result.failing).toEqual(["diet"]);
  });
});
