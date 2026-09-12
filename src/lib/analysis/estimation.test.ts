import { describe, expect, it } from "vitest";
import { idaPreg } from "../facts/fixture.ts";
import { buildSap } from "../sap/build.ts";

/**
 * An outcome that estimates one number says so, and is believed.
 *
 * The estimation exception - a summary with a confidence interval, no model and
 * no p value - used to be inferred from the study having fewer than two groups.
 * That inference is what turned an analytical cohort into a prevalence survey,
 * and removing it left the exception with no way to arise except by the same
 * counting. So the kind is authoritative in both directions: a study with two
 * arms whose outcome is asked only "how many" takes the exception, and a study
 * with none whose outcome names its factors does not.
 *
 * This is the half the shape cannot reach, and without it the clause in Step 4
 * could be deleted with every test still passing.
 */

describe("the estimation exception", () => {
  it("follows the outcome's own word, not the number of arms", () => {
    const counted = buildSap({
      ...idaPreg,
      primary: { ...idaPreg.primary, kind: "estimation" },
    });
    const primary = counted.analysis.find((r) => r.objective.startsWith("P1"))!;

    // Two arms, and still an estimation: the outcome says it compares nothing.
    expect(idaPreg.groups).toHaveLength(2);
    expect(primary.exception).toBe("estimation");
    expect(primary.adjusted).toBeNull();

    // And the worked example, whose primary is a comparison, is not one.
    const compared = buildSap(idaPreg);
    expect(
      compared.analysis.find((r) => r.objective.startsWith("P1"))!.exception,
    ).toBeNull();
  });
});
