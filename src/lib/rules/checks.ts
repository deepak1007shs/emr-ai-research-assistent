import type {
  CheckResult,
  Objective,
  Rules,
} from "../study/types.ts";

/**
 * The three checks Step 5 owes.
 *
 * All three block, and all three catch the same kind of failure: a rule that
 * governs every table and is written nowhere. A plan with no interim rule is
 * not a plan that forbids an interim look; it is a plan under which somebody
 * takes one and nobody can say afterwards whether it was allowed.
 */

const ok = (id: string, message: string): CheckResult => ({
  id,
  pass: true,
  failing: [],
  message,
});

export function step5Checks(
  objectives: Objective[],
  rules: Rules,
): CheckResult[] {
  const results: CheckResult[] = [];

  /* S5-1: every objective belongs to an analysis population. */
  const named = rules.populations
    .map((p) => p.definition)
    .join(" ");
  const unassigned = objectives.filter(
    (o) => o.family !== "exploratory" && !named.includes(o.id),
  );
  results.push(
    rules.populations.length > 0 && unassigned.length === 0
      ? ok("S5-1", "Every objective is assigned to an analysis population.")
      : {
          id: "S5-1",
          pass: false,
          failing: unassigned.map((o) => o.id),
          message: rules.populations.length
            ? `${unassigned.map((o) => o.id).join(", ")} is analysed on a set nobody has defined. Whether a withdrawal counts changes the answer, and the plan has to say so before the data arrive.`
            : "No analysis population is defined. Every number in the plan is a number from some set of participants, and the plan does not say which.",
    },
  );

  /* S5-2: every family present has its multiplicity line. */
  const families = new Set(objectives.map((o) => o.family));
  const missing = [...families].filter((f) => !rules.multiplicity[f]?.trim());
  results.push(
    missing.length === 0
      ? ok("S5-2", "Every family present has its multiplicity line.")
      : {
          id: "S5-2",
          pass: false,
          failing: missing,
          message: `The ${missing.join(" and ")} ${missing.length === 1 ? "family has" : "families have"} no multiplicity rule. Several questions tested at 0.05 each is not one test at 0.05, and the difference has to be stated before anybody sees a p value.`,
        },
  );

  /* S5-3: the interim rule exists, even when it is "none". */
  results.push(
    rules.interim.trim()
      ? ok("S5-3", "The interim rule is stated.")
      : {
          id: "S5-3",
          pass: false,
          failing: ["interim"],
          message:
            "The plan says nothing about interim analysis. Silence is not a prohibition: it is the state in which somebody takes an early look and nobody can say afterwards whether it was allowed.",
        },
  );

  return results;
}
