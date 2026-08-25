import { describe, expect, it } from "vitest";
import { chooseTest, degreesOfFreedomNote, loadRules } from "./choose-test.ts";

const rules = loadRules();

const row = (over: Partial<Parameters<typeof chooseTest>[0]> = {}) => ({
  data_type: "binary" as const,
  comparison: "two_groups" as const,
  paired: false,
  skewed: false,
  ...over,
});

describe("loadRules", () => {
  it("reads the markdown table", () => {
    expect(rules.length).toBeGreaterThan(25);
    expect(rules[0]).toHaveProperty("test");
    expect(rules.every((r) => r.test && r.why)).toBe(true);
  });
});

describe("chooseTest", () => {
  it("gives an exact interval for a single proportion", () => {
    const hit = chooseTest(row({ comparison: "single_group" }));
    expect(hit?.test).toContain("Clopper-Pearson");
    expect(hit?.why).toMatch(/exact rather than Wald/i);
  });

  it("gives chi-square for two unpaired groups, McNemar when paired", () => {
    expect(chooseTest(row())?.test).toContain("Chi-square");
    expect(chooseTest(row({ paired: true }))?.test).toContain("McNemar");
  });

  it("switches to a rank test when the data are skewed", () => {
    const normal = chooseTest(row({ data_type: "continuous" }));
    const skewed = chooseTest(row({ data_type: "continuous", skewed: true }));
    expect(normal?.test).toContain("t-test");
    expect(skewed?.test).toContain("Mann-Whitney");
    expect(skewed?.why).toContain("mean would mislead");
  });

  it("gives logistic regression for a binary outcome with predictors", () => {
    expect(chooseTest(row({ comparison: "association" }))?.test).toContain("logistic");
    expect(chooseTest(row({ comparison: "adjusted" }))?.test).toContain("Multivariable");
  });

  it("gives Cox for time to event, and says the assumption must be checked", () => {
    const hit = chooseTest(row({ data_type: "time_to_event", comparison: "association" }));
    expect(hit?.test).toContain("Cox");
    expect(hit?.why).toContain("proportional-hazards");
  });

  it("never lets a case-control style association claim a mean", () => {
    // A nominal outcome cannot yield a t-test whatever the comparison.
    const hit = chooseTest(row({ data_type: "nominal" }));
    expect(hit?.test).not.toContain("t-test");
  });

  it("returns null when no rule covers the row, rather than guessing", () => {
    expect(chooseTest(row({ data_type: "count", comparison: "agreement" }))).toBeNull();
  });

  it("honours an override, and carries the reason", () => {
    const hit = chooseTest(
      row({ test_override: "Competing-risks regression", override_reason: "Death is a competing event" }),
    );
    expect(hit?.test).toBe("Competing-risks regression");
    expect(hit?.overridden).toBe(true);
    expect(hit?.why).toContain("competing event");
  });

  it("says so when an override arrives with no reason", () => {
    const hit = chooseTest(row({ test_override: "Something unusual" }));
    expect(hit?.why).toContain("no reason was given");
  });

  it("is deterministic: the same row always gives the same test", () => {
    const a = chooseTest(row({ data_type: "continuous", skewed: true }));
    const b = chooseTest(row({ data_type: "continuous", skewed: true }));
    expect(a).toEqual(b);
  });
});

describe("degreesOfFreedomNote", () => {
  it("declares the model exploratory when it cannot afford its predictors", () => {
    const { affordable, overfits, note } = degreesOfFreedomNote(10, 3);
    expect(affordable).toBe(1);
    expect(overfits).toBe(true);
    expect(note).toContain("declared exploratory");
  });

  it("says the model is supported when it can afford them", () => {
    const { overfits, note } = degreesOfFreedomNote(120, 3);
    expect(overfits).toBe(false);
    expect(note).toContain("adequately supported");
  });
});
