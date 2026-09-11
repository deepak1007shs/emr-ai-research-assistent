import type { CheckResult, FactsSheet, OutcomeChain } from "../study/types.ts";
import type { DesignFamily, Frame } from "../study/vocabulary.ts";

/**
 * Gate A: the SAP cannot start until the design and the primary outcome are
 * settled.
 *
 * Everything downstream rests on these. A plan begun while the primary outcome
 * is still "efficacy" builds every table on a guess, and the guess is not
 * visible again until a supervisor reads the finished document. So this is a
 * hard stop rather than a warning.
 */

/** The guideline each design owes, from the Stage 1 decision table. */
export const GUIDELINE: Record<DesignFamily, string> = {
  randomised_trial: "CONSORT",
  non_inferiority_trial: "CONSORT",
  crossover_trial: "CONSORT",
  cluster_trial: "CONSORT",
  factorial_trial: "CONSORT",
  non_randomised_interventional: "TREND",
  cohort: "STROBE",
  case_control: "STROBE",
  cross_sectional: "STROBE",
  descriptive_epidemiology: "STROBE",
  diagnostic_accuracy: "STARD",
  prognostic_model: "TRIPOD",
  agreement: "GRRAS",
  qualitative: "COREQ",
  mixed_methods: "GRAMMS",
  systematic_review: "PRISMA",
  economic_evaluation: "CHEERS",
  case_report: "CARE",
};

/** Which frame a design owes: assigned means PICO, observed means PECO. */
export const FRAME: Record<DesignFamily, Frame> = {
  randomised_trial: "PICO",
  non_inferiority_trial: "PICO",
  crossover_trial: "PICO",
  cluster_trial: "PICO",
  factorial_trial: "PICO",
  non_randomised_interventional: "PICO",
  cohort: "PECO",
  case_control: "PECO",
  cross_sectional: "PECO",
  descriptive_epidemiology: "PECO",
  diagnostic_accuracy: "PECO",
  prognostic_model: "PECO",
  agreement: "PECO",
  qualitative: "PECO",
  mixed_methods: "PECO",
  systematic_review: "PECO",
  economic_evaluation: "PECO",
  case_report: "PECO",
};

/**
 * The words that actually name a design.
 *
 * Tested for rather than against, because the words that do not name one are
 * endless: "prospective", "retrospective", "ambispective", "observational",
 * "comparative", "analytical", "hospital-based", and any two of them with a
 * comma between. A label is a design when it contains one of these and not when
 * it avoids a list of the others.
 *
 * "Prospective study" is the commonest design label in a thesis protocol and it
 * names no design at all: a prospective study can be a trial, a cohort or a
 * case series, and each owes a different guideline and different tables.
 */
const DESIGN_WORDS = [
  "randomised", "randomized", "trial", "rct", "crossover", "cross-over",
  "factorial", "cluster", "cohort", "case-control", "case control",
  "cross-sectional", "cross sectional", "diagnostic", "accuracy", "prognostic",
  "prediction", "agreement", "reliability", "validation", "qualitative",
  "systematic review", "meta-analysis", "economic", "case report",
  "case series", "before-after", "pre-post", "quasi-experimental",
  "interventional", "non-inferiority", "noninferiority", "equivalence",
  "prevalence survey", "surveillance",
];

const namesADesign = (label: string) => {
  const text = label.toLowerCase();
  return DESIGN_WORDS.some((word) => text.includes(word));
};

const filled = (value: string) => value.trim().length > 0;

/** Every link of the chain, so a reader knows what is measured and how. */
function missingLinks(chain: OutcomeChain): string[] {
  const gaps: string[] = [];
  if (!filled(chain.what)) gaps.push("what is measured");
  if (!filled(chain.how)) gaps.push("how it is measured");
  if (!filled(chain.instrument)) gaps.push("the instrument");
  if (!chain.time.length) gaps.push("when it is measured");
  if (!filled(chain.unit)) gaps.push("the unit");
  return gaps;
}

export function gateA(facts: FactsSheet): CheckResult[] {
  const results: CheckResult[] = [];

  /* G-A1: the design is a design, and it owes the guideline it claims. */
  const owed = GUIDELINE[facts.design];
  const label = facts.design_label.trim();
  const timingOnly = filled(label) && !namesADesign(label);
  const guidelineAgrees =
    facts.guideline.trim().toUpperCase().startsWith(owed.toUpperCase());

  results.push({
    id: "G-A1",
    pass: filled(label) && !timingOnly && guidelineAgrees,
    failing: filled(label) && !timingOnly && guidelineAgrees ? [] : [facts.design],
    message: !filled(label)
      ? "The design has no label. Name it exactly: what was assigned or observed, how many groups, and whether it tests superiority."
      : timingOnly
        ? `"${label}" says when the data were collected, not what the study is. A prospective study can be a trial, a cohort or a case series, and each owes different tables.`
        : guidelineAgrees
          ? "The design is stated exactly and matches its reporting guideline."
          : `The design is ${facts.design.replace(/_/g, " ")}, which is reported to ${owed}, but the facts say ${facts.guideline || "no guideline"}.`,
  });

  /* G-A2: one primary outcome, with every link of its chain. */
  const gaps = missingLinks(facts.primary);
  results.push({
    id: "G-A2",
    pass: gaps.length === 0,
    failing: gaps.length ? ["primary"] : [],
    message: gaps.length
      ? `The primary outcome does not say ${gaps.join(", ")}. Every table below it would rest on that gap.`
      : "The primary outcome names what is measured, how, with which instrument, when and in what unit.",
  });

  /* G-A3: the groups are named, and every outcome has a time. */
  const untimed = [facts.primary, ...facts.secondary].filter((o) => !o.time.length);
  const comparative = facts.frame === "PICO" || facts.groups.length > 0;
  const groupsNamed =
    !comparative ||
    (facts.groups.length >= 2 &&
      facts.groups.every((g) => filled(g.code) && filled(g.label)));

  results.push({
    id: "G-A3",
    pass: groupsNamed && untimed.length === 0,
    failing: [
      ...(groupsNamed ? [] : ["groups"]),
      ...untimed.map((o) => o.what || "an unnamed outcome"),
    ],
    message: !groupsNamed
      ? "The study compares groups, and the groups are not both named and defined. A comparison needs to say what is being compared with what."
      : untimed.length
        ? `${untimed.map((o) => `"${o.what}"`).join(", ")} ${untimed.length === 1 ? "has" : "have"} no time point. An outcome with no time cannot be collected or tabulated.`
        : "The groups are named and defined, and every outcome has its time points.",
  });

  return results;
}

/** True where nothing blocks the SAP from starting. */
export function gateAPasses(facts: FactsSheet): boolean {
  return gateA(facts).every((result) => result.pass);
}
