import type { FactsSheet, Objective } from "../study/types.ts";

/**
 * What a title promises, and what would have to exist to keep the promise.
 *
 * A fixed, versioned list. The written process is explicit that this is not
 * left to a language model, and the reason is that it is the one check that
 * catches a plan for a study nobody asked for: the title says "the rise in
 * haemoglobin", the plan answers "how much by week six", the two look alike on
 * the page, and the gap is only visible if something holds the words.
 *
 * Adding a word here is a deliberate act. Bump VERSION when you do, so a plan
 * built last month can be told apart from one built against a longer list.
 */
export const VERSION = "2026-09-11";

export type TitlePromise = {
  id: string;
  /** Lower case; matched by containment against the lower-cased title. */
  words: string[];
  /** What the title committed the study to. */
  promise: string;
  /** True where the plan keeps it. */
  kept: (facts: FactsSheet, objectives: Objective[]) => boolean;
  /** What to do where it does not. */
  remedy: string;
};

const chains = (facts: FactsSheet) => [facts.primary, ...facts.secondary];

export const TITLE_PROMISES: TitlePromise[] = [
  {
    id: "comparison",
    words: [
      "versus", " vs ", "compared with", "compared to", "comparison",
      "comparative", "superiority", "efficacy", "effectiveness", "better than",
    ],
    promise: "a comparison between groups",
    kept: (facts, objectives) =>
      facts.groups.length >= 2 &&
      objectives.some((o) => o.comparison !== "single group"),
    remedy: "Name the two groups being compared, or take the comparison out of the title.",
  },
  {
    id: "trajectory",
    words: [
      "rise", "fall", "trend", "trajectory", "rate of", "over time",
      "serial", "longitudinal", "kinetics",
    ],
    promise: "how fast something moves, not only how far",
    kept: (_facts, objectives) => objectives.some((o) => o.kind === "shape"),
    remedy:
      "Add the rate-of-change objective, which needs the outcome measured at three or more visits, or drop the word from the title.",
  },
  {
    id: "association",
    words: [
      "association", "associated", "correlation", "correlated", "relationship",
      "determinant", "predictor", "risk factor",
    ],
    promise: "a relation between two things, not only a difference",
    kept: (facts, objectives) =>
      objectives.some((o) => o.family === "exploratory") ||
      ["cohort", "case_control", "cross_sectional", "prognostic_model"].includes(
        facts.design,
      ),
    remedy: "Add the objective that tests the relation, naming both variables.",
  },
  {
    id: "safety",
    words: ["safety", "adverse", "tolerability", "side effect", "side-effect"],
    promise: "a report of harms",
    kept: (facts) =>
      chains(facts).some((c) =>
        /adverse|safety|side.effect|tolerab|harm/i.test(c.what),
      ),
    remedy: "Add the safety outcome, with what is recorded and at which visits.",
  },
  {
    id: "accuracy",
    words: [
      "accuracy", "sensitivity", "specificity", "diagnostic", "screening",
      "validity", "validation",
    ],
    promise: "how well a test identifies a condition",
    kept: (facts) => facts.design === "diagnostic_accuracy",
    remedy:
      "Either the study is a diagnostic accuracy study and the design says so, or the title claims an analysis the design cannot support.",
  },
  {
    id: "survival",
    words: ["survival", "time to", "time-to", "mortality", "free survival"],
    promise: "how long until something happens",
    kept: (facts) => chains(facts).some((c) => c.type === "time_to_event"),
    remedy:
      "Give the outcome a start point, an event and a censoring rule, and set its type to time to event.",
  },
  {
    id: "frequency",
    words: ["prevalence", "incidence", "burden", "magnitude", "proportion of"],
    promise: "an estimate of how common something is",
    kept: (facts, objectives) =>
      objectives.some((o) => o.comparison === "single group") ||
      ["cross_sectional", "descriptive_epidemiology"].includes(facts.design),
    remedy:
      "Add the estimation objective. It is reported as a proportion with a confidence interval and no p value.",
  },
];

/** Every promise the title makes, in the order the list declares them. */
export function promisesIn(title: string): TitlePromise[] {
  const text = ` ${title.toLowerCase()} `;
  return TITLE_PROMISES.filter((p) => p.words.some((w) => text.includes(w)));
}
