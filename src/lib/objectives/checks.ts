import type {
  CheckResult,
  FactsSheet,
  Objective,
  Picot,
} from "../study/types.ts";
import { variableName } from "../variables/name.ts";
import { isRepeated } from "./build.ts";
import { promisesIn } from "./promises.ts";

/**
 * The four checks Step 1 owes.
 *
 * Each one is a set operation over objects that are already written down. None
 * of them asks a model anything, which is why they can run in a test with no
 * API key and why they give the same answer twice.
 */

const ok = (id: string, message: string): CheckResult => ({
  id,
  pass: true,
  failing: [],
  message,
});

export function step1Checks(
  facts: FactsSheet,
  picot: Picot,
  objectives: Objective[],
): CheckResult[] {
  const results: CheckResult[] = [];

  /* S1-1: the printed frame is the locked one. */
  results.push(
    picot.frame === facts.frame
      ? ok("S1-1", `The frame printed is ${facts.frame}, the one Stage 1 locked.`)
      : {
          id: "S1-1",
          pass: false,
          failing: [picot.frame],
          message: `Stage 1 locked ${facts.frame} and the plan prints ${picot.frame}. The letter decides whether the study assigned the exposure or found it, and every causal word downstream follows from that.`,
        },
  );

  /* S1-2: each objective names one outcome and one comparison. */
  // Exploratory questions are exempt: Step 3 decides what each is about, and
  // an outcome named here would be a guess this build is written to refuse.
  const thin = objectives.filter(
    (o) =>
      o.family !== "exploratory" &&
      (!o.id || !o.question.trim() || !o.outcome || !o.comparison),
  );
  results.push(
    thin.length === 0
      ? ok("S1-2", "Every objective has an id, one outcome and one comparison.")
      : {
          id: "S1-2",
          pass: false,
          failing: thin.map((o) => o.id || "an objective with no id"),
          message: `${thin.map((o) => o.id).join(", ")} ${thin.length === 1 ? "does" : "do"} not name both an outcome and a comparison. An objective missing either cannot be given a test or a table.`,
        },
  );

  /* S1-3: the title's promises are kept, or asked about. */
  const asked = (words: string[]) =>
    facts.open_items.some((item) => {
      const text = item.toLowerCase();
      return words.some((word) => text.includes(word.trim()));
    });
  const broken = promisesIn(facts.title).filter(
    (p) => !p.kept(facts, objectives) && !asked(p.words),
  );
  results.push(
    broken.length === 0
      ? ok(
          "S1-3",
          "Every analysis the title promises has an objective, or a question waiting for the investigator.",
        )
      : {
          id: "S1-3",
          pass: false,
          failing: broken.map((p) => p.id),
          message: broken
            .map(
              (p) =>
                `The title promises ${p.promise} and no objective delivers it. ${p.remedy}`,
            )
            .join(" "),
        },
  );

  /* S1-4: a repeated outcome owes a level question and a shape question. */
  const chains = [facts.primary, ...facts.secondary].filter(isRepeated);
  const halfDone = chains.filter((chain) => {
    // The two objectives point at two different variables on purpose: the
    // level asks about the derived value, the shape asks about the readings.
    // Both are the same outcome chain, which is what this collects.
    const linked = [variableName(chain.what), ...chain.measures];
    const forChain = objectives.filter((o) => linked.includes(o.outcome));
    return (
      !forChain.some((o) => o.kind === "level") ||
      !forChain.some((o) => o.kind === "shape")
    );
  });
  results.push(
    halfDone.length === 0
      ? ok(
          "S1-4",
          "Every outcome measured three times or more is asked both how far it moved and how fast.",
        )
      : {
          id: "S1-4",
          pass: false,
          failing: halfDone.map((c) => c.what),
          message: `${halfDone.map((c) => `"${c.what}"`).join(", ")} ${halfDone.length === 1 ? "is" : "are"} measured at ${halfDone.map((c) => c.time.length).join(" and ")} visits and asked only one question. The visits in between are collected and never analysed.`,
        },
  );

  return results;
}
