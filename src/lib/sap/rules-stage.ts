import Anthropic from "@anthropic-ai/sdk";
import { EFFORT, MODEL } from "../protocol/analyze.ts";
import { decisionsBlock } from "../protocol/answers.ts";
import { explainApiError } from "../protocol/api-error.ts";
import type { TokenUsage } from "../protocol/pricing.ts";
import type { SapSpec } from "./types.ts";

/**
 * The back half of the route map: the rules, the ladder and the assumptions.
 *
 * A second call, not because the schema would not fit, but because the
 * assumptions belong to the test that was chosen, and the tests are chosen by
 * code after the first call returns. Asking for them together would mean asking
 * a model to guess which tests it was about to be given.
 *
 * The protocol is not re-sent. Everything this needs is in the front half.
 */

const str = { type: "string" } as const;

function obj<T extends Record<string, unknown>>(properties: T, description?: string) {
  return {
    type: "object",
    ...(description ? { description } : {}),
    properties,
    required: Object.keys(properties),
    additionalProperties: false,
  } as const;
}

export const SAP_RULES_JSON_SCHEMA = obj({
  rules: obj(
    {
      software: { ...str, description: "As the protocol states it, e.g. IBM SPSS Statistics version 23. TODO if unstated." },
      normality: { ...str, description: "How normality is assessed before a parametric test is chosen." },
      continuous_summary: { ...str, description: "Mean +/- SD when normal, median (IQR) when skewed." },
      categorical_summary: { ...str, description: "Frequency (percentage)." },
      significance: { ...str, description: "Two sided, and the alpha." },
      effect_estimates: { ...str, description: "That every estimate carries a 95% CI rather than a bare p value." },
      missing_data: {
        ...str,
        description:
          "Complete case or multiple imputation, with the threshold that decides. Say that last observation carried forward is not used. TODO if the protocol does not specify one.",
      },
      multiplicity: {
        ...str,
        description:
          "Which family is confirmatory, what is supportive, and the correction for each. TODO if unstated.",
      },
      reproducibility: { ...str, description: "A fixed random seed, set and reported, for anything stochastic." },
    },
    "Fixed before the data are seen, so they are never re-decided afterwards.",
  ),
  populations: {
    type: "array",
    description:
      "Who is analysed. For a trial: intention to treat, modified ITT with its exclusions, per protocol, safety set. For an observational study: the full analysis set and the complete case set, with any exclusions.",
    items: obj({ name: str, definition: str }),
  },
  baseline_comparison: {
    ...str,
    description:
      "How baseline balance is reported. In a randomised trial, say explicitly that baseline variables are NOT significance tested, per CONSORT, and that imbalance is judged clinically and by standardised difference.",
  },
  intercurrent_events: {
    type: "array",
    description:
      "The events that change what is being estimated: discontinuation, rescue therapy, death as a competing event. Each with the strategy that matches the estimand. Empty where the design has none.",
    items: obj({ event: str, strategy: str }),
  },
  testing_hierarchy: {
    ...str,
    description:
      "The order of testing, fixed before unblinding: primary first, then each key secondary in a stated order, stopping when a step is not significant. Say which endpoints are confirmatory and which are exploratory.",
  },
  subgroups: {
    type: "array",
    description:
      "Pre-specified subgroups only. Each tested by an interaction term in the model, never by comparing within-subgroup p values. Empty where none are planned.",
    items: obj({ subgroup: str, how_tested: str }),
  },
  interim: {
    ...str,
    description:
      "The number and timing of interim analyses, the alpha-spending boundary and who reviews them. Where there are none, say exactly: 'Single final analysis; no interim looks.'",
  },
  steps: {
    type: "array",
    description:
      "The ladder for the primary objective: describe, then unadjusted, then adjusted, then sensitivity. Four to six steps, each naming what is actually done in this study.",
    items: obj({ step: { ...str, description: "Step 1, Step 2..." }, what: str }),
  },
  assumption_checks: {
    type: "array",
    description:
      "One row per assumption of each test named below, and no others. Do not list assumptions of tests this study does not run. Cover every test in the list.",
    items: obj({
      test: { ...str, description: "Copied EXACTLY from the list of tests given to you." },
      assumption: str,
      how_checked: str,
      if_violated: { ...str, description: "The fallback, named." },
      example: { ...str, description: "A short example in this study's own clinical terms." },
    }),
  },
  flags: {
    type: "array",
    description:
      "Decisions still open, to settle with the guide before the plan is signed. Typically three to eight. Each is specific to this protocol: a term left undefined by a standard, a sample size not tied to the primary analysis, an outcome scale with no cut-off, a follow-up method unstated.",
    items: obj({ flag: str, why: { ...str, description: "Why it matters, in one sentence." } }),
  },
});

const ROLE = `You are a senior trial statistician finishing a Statistical Analysis Plan.

The front half is written: the study, its question, its objectives, its variables
and the analysis map. You are writing what is left, which is what turns a list of
tests into a plan somebody can follow: the rules fixed in advance, who is analysed,
how multiplicity is handled, the ladder of steps, the assumptions behind each
chosen test, and the decisions still open.

The tests have already been chosen, by rule, from the data type and the comparison.
You are given the list. Write the assumptions of THOSE tests and no others: an
assumption of a test this study does not run is noise, and it is the kind of noise
that makes a plan look thorough while helping nobody.

Every check says how it is checked, what to do when it fails, and one example in
this study's own clinical terms.

Where the protocol settles nothing, say what it should say and open with "TODO: ".
Do not invent a decision the investigator has not made.`;

export type RulesResult = {
  rules: Pick<
    SapSpec,
    | "rules"
    | "populations"
    | "baseline_comparison"
    | "intercurrent_events"
    | "testing_hierarchy"
    | "subgroups"
    | "interim"
    | "steps"
    | "assumption_checks"
    | "flags"
  >;
  model: string;
  usage: TokenUsage;
};

export async function buildSapRules(
  /** The front half, already built. */
  front: Omit<SapSpec, keyof RulesResult["rules"]>,
  /** The tests code chose, deduplicated, in the order the map lists them. */
  tests: string[],
  options: {
    answers?: string | null;
    onProgress?: (note: string) => void;
    onUsage?: (usage: TokenUsage) => void;
  } = {},
): Promise<RulesResult> {
  const client = new Anthropic({ timeout: 30 * 60 * 1000, maxRetries: 3 });

  const content: Anthropic.ContentBlockParam[] = [
    {
      type: "text",
      text: `The front half of the plan:\n\n${JSON.stringify({
        title: front.title,
        design: front.design,
        setting: front.setting,
        guideline: front.guideline,
        glance: front.glance,
        picot: front.picot,
        aim: front.aim,
        hypothesis: front.hypothesis,
        estimand: front.estimand,
        objectives: front.objectives,
        variables: front.variables,
        outcomes: front.outcomes,
        analyses: front.analyses,
        sample_size: front.sample_size,
        expected_events: front.expected_events,
        sample_size_note: front.sample_size_note,
        priority_confounder_ids: front.priority_confounder_ids,
      })}`,
    },
    {
      type: "text",
      text: `The tests chosen for this study, by rule. Write the assumptions of
these and no others, copying each name exactly:

${tests.map((t) => `- ${t}`).join("\n")}`,
    },
  ];

  const decisions = decisionsBlock(options.answers, "plan");
  if (decisions) content.push({ type: "text", text: decisions });

  options.onProgress?.("Writing the rules, the ladder and the assumptions");

  const stream = client.messages.stream({
    model: MODEL,
    max_tokens: 32000,
    thinking: { type: "adaptive" },
    output_config: { effort: EFFORT, format: { type: "json_schema", schema: SAP_RULES_JSON_SCHEMA } },
    system: [{ type: "text", text: ROLE }],
    messages: [{ role: "user", content }],
  });

  stream.on("streamEvent", (event) => {
    if (event.type === "message_delta") {
      options.onUsage?.({
        input_tokens: 0,
        output_tokens: event.usage.output_tokens ?? 0,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0,
      });
    }
  });

  let message;
  try {
    message = await stream.finalMessage();
  } catch (error) {
    const explained = explainApiError(error);
    if (explained) throw new Error(explained);
    throw error;
  }
  const text = message.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");

  return {
    rules: JSON.parse(text) as RulesResult["rules"],
    model: message.model,
    usage: {
      input_tokens: message.usage.input_tokens,
      output_tokens: message.usage.output_tokens,
      cache_creation_input_tokens: message.usage.cache_creation_input_tokens ?? 0,
      cache_read_input_tokens: message.usage.cache_read_input_tokens ?? 0,
    },
  };
}
