import { describe, expect, it } from "vitest";
import { idaPreg } from "../facts/fixture.ts";
import { buildObjectives, buildPicot, isRepeated } from "./build.ts";

describe("Step 1, the objectives", () => {
  it("gives the eight ids the worked example gives", () => {
    expect(buildObjectives(idaPreg).map((o) => o.id)).toEqual([
      "P1a", "P1b", "S1", "S2", "S3", "E1", "E2", "E3",
    ]);
  });

  it("splits the primary into a level question and a shape question", () => {
    const [level, shape] = buildObjectives(idaPreg);
    expect(level.kind).toBe("level");
    expect(shape.kind).toBe("shape");
    expect(shape.question).toBe(
      "Is the rate of change in haemoglobin across Day 0, Week 2, Week 4 and Week 6 different"
      + " between IV ferric carboxymaltose and Oral ferrous ascorbate?",
    );
  });

  it("does not split an outcome read at two visits, however it is worded", () => {
    // Ferritin is a change from day 0 to week 6 and reads like the primary.
    // Two readings cannot describe a trajectory, so there is no shape question.
    const ferritin = idaPreg.secondary[1];
    expect(ferritin.what).toContain("Change in");
    expect(isRepeated(ferritin)).toBe(false);
    expect(buildObjectives(idaPreg).filter((o) => o.id.startsWith("S2"))).toHaveLength(1);
  });

  it("does not split a binary outcome asked at three visits", () => {
    // Adverse effects are recorded at W2, W4 and W6, which passes the count.
    // "The rate of change in adverse effects" is not a question anyone asked.
    const adverse = idaPreg.secondary[2];
    expect(adverse.time).toHaveLength(3);
    expect(isRepeated(adverse)).toBe(false);
  });

  it("writes every objective as a question naming the comparison", () => {
    for (const objective of buildObjectives(idaPreg)) {
      expect(objective.question.endsWith("?")).toBe(true);
      expect(objective.comparison).toBe(
        "IV ferric carboxymaltose and Oral ferrous ascorbate",
      );
    }
  });

  it("words a binary outcome as a proportion and a count as a number", () => {
    const s1 = buildObjectives(idaPreg).find((o) => o.id === "S1");
    expect(s1?.question).toBe(
      "Is the proportion with anaemia corrected different between IV ferric carboxymaltose and Oral ferrous ascorbate?",
    );
  });

  it("links each objective to its outcome by the name Step 2 will use", () => {
    const ids = Object.fromEntries(
      buildObjectives(idaPreg).map((o) => [o.id, o.outcome]),
    );
    expect(ids.P1a).toBe("change_in_haemoglobin");
    // The trajectory is asked of the readings, not of the one number they make.
    expect(ids.P1b).toBe("haemoglobin");
    expect(ids.S1).toBe("anaemia_corrected");
  });

  it("keeps an exploratory idea in the words the protocol used", () => {
    const e3 = buildObjectives(idaPreg).find((o) => o.id === "E3");
    expect(e3?.source).toBe("hypothesis");
    expect(e3?.question).toBe(
      "Does the effect on haemoglobin differ by dietary pattern?",
    );
    // It is not linked to an outcome here. Step 3 decides what it is about.
    expect(e3?.outcome).toBe("");
  });
});

describe("Step 1, PICOT", () => {
  it("labels the second row Intervention for a trial", () => {
    expect(buildPicot(idaPreg).rows.map((r) => r.element)).toEqual([
      "Population", "Intervention", "Comparator", "Outcome", "Time / Type of study",
    ]);
  });

  it("labels it Exposure when the study observes", () => {
    const observed = { ...idaPreg, frame: "PECO" as const };
    expect(buildPicot(observed).rows[1].element).toBe("Exposure");
    expect(buildPicot(observed).rows[1].letter).toBe("I");
  });

  it("assembles one question from the rows", () => {
    expect(buildPicot(idaPreg).assembled_question).toContain(
      "compared with oral ferrous ascorbate",
    );
    expect(buildPicot(idaPreg).assembled_question).toContain("change in haemoglobin");
  });
});
