import Anthropic from "@anthropic-ai/sdk";
import { EFFORT, MODEL } from "../protocol/analyze.ts";
import { decisionsBlock } from "../protocol/answers.ts";
import { explainApiError } from "../protocol/api-error.ts";
import type { TokenUsage } from "../protocol/pricing.ts";
import type { AnalysisRow, SapSpec } from "./types.ts";

/**
 * The analysis map, as its own call.
 *
 * It was part of the first call until the API refused to compile the schema:
 * the frame, both registries and the map together were more grammar than it
 * would take. The seam is a natural one. The map refers to variables and
 * outcomes by the ids the registries declare, so it needs them as input
 * whatever happens, and asking for them together meant asking a model to point
 * at ids it was inventing in the same breath.
 */

const str = { type: "string" } as const;
const strArray = { type: "array", items: str } as const;

function obj<T extends Record<string, unknown>>(properties: T, description?: string) {
  return {
    type: "object",
    ...(description ? { description } : {}),
    properties,
    required: Object.keys(properties),
    additionalProperties: false,
  } as const;
}

export const SAP_MAP_JSON_SCHEMA = obj({
  analyses: {
    type: "array",
    description:
      "One row per objective, in the order of the objectives, or one row for a group of objectives that share an analysis. Refer to outcomes and variables by the ids the plan declares, never by repeating their words.",
    items: obj({
      objective_ids: {
        ...strArray,
        description:
          "The objectives this row answers. Usually one. Several where the same analysis answers them all, as three binary secondary outcomes compared the same way do: write them as one row rather than repeating it.",
      },
      label: { ...str, description: "'P1 - conversion rate'. The ids, then a few words." },
      outcome_ids: {
        ...strArray,
        description: "The outcomes this analyses. Several where they share one analysis.",
      },
      exposure_ids: {
        ...strArray,
        description:
          "What is being compared: the allocated arm, or the exposure. Empty for a single-group estimate. This is NOT the confounder list.",
      },
      adjust_for_ids: {
        ...strArray,
        description:
          "The confounders the adjusted model holds constant, from the variable registry. Empty where no adjustment is planned. Never a mediator or a collider.",
      },
      data_type: {
        type: "string",
        enum: ["binary", "continuous", "ordinal", "nominal", "count", "time_to_event"],
      },
      comparison: {
        type: "string",
        enum: ["single_group", "two_groups", "many_groups", "association", "adjusted", "paired", "correlation", "agreement", "descriptive"],
        description:
          "single_group estimates one proportion or mean; two_groups compares two; association regresses the outcome on predictors; adjusted does so with confounders held constant; descriptive is frequencies with no test.",
      },
      pairing: {
        type: "string",
        enum: ["none", "paired", "repeated"],
        description:
          "none for independent groups; paired for the same patients measured twice; repeated for three or more measurements per patient, which needs a mixed model rather than a repeated-measures ANOVA.",
      },
      skewed: {
        type: "boolean",
        description:
          "True when the outcome is known to be skewed, such as length of stay or duration, which forces a rank method.",
      },
      frequency: {
        type: "string",
        enum: ["common", "rare", "unknown"],
        description:
          "For a BINARY outcome only: whether the event is common (roughly over 10%) or rare. It decides whether the plan reports a risk ratio or an odds ratio, and reporting an odds ratio for a common outcome as though it were a risk is one of the commonest errors in a thesis. Use unknown only where the protocol gives no basis to judge.",
      },
      no_adjustment_reason: {
        ...str,
        description:
          "Why no adjusted model is planned, where none is. A pilot with few events says so here, e.g. 'not planned in a pilot; would need ten events per variable'. Empty where adjustment IS planned.",
      },
      table_ids: {
        ...strArray,
        description:
          "The tables this analysis fills. Often more than one: the unadjusted estimate, the adjusted model, and any sensitivity table beside them. T1, T2, T3...",
      },
      test_override: {
        ...str,
        description:
          "Leave empty. Fill only where the standard rule genuinely does not fit, such as competing risks or clustering.",
      },
      override_reason: { ...str, description: "Required when test_override is filled. Prints in the plan." },
    }),
  },
});

const ROLE = `You are a senior medical research methodologist and trial statistician.

You are given a study: its question, its objectives, its variables and its
outcomes, all already written. You are writing the analysis map, which is the row
per objective that links each question to the outcomes it measures, what is being
compared, what is held constant, and the tables it will fill.

Do not name a statistical test. The application plans the analysis from the data
type, the comparison, the pairing and, for a binary outcome, how common the event
is, so that the same study always yields the same plan. What you supply are the
facts it needs to decide:

- whether the measurements are independent, paired, or repeated across three or
  more time points, because a repeated measure needs a mixed model and not a
  repeated-measures ANOVA;
- for a binary outcome, whether the event is common or rare, because a common
  outcome must be reported as a risk ratio and a risk difference rather than an
  odds ratio;
- what is being compared, kept apart from what is being held constant;
- where no adjusted model is planned, why not.

Every id you use must be one the plan already declares. One row may answer
several objectives where the analysis is identical, and one row usually fills
more than one table: the unadjusted estimate, the adjusted model, and any
sensitivity table beside them.`;

export type MapResult = {
  analyses: AnalysisRow[];
  model: string;
  usage: TokenUsage;
};

export async function buildSapMap(
  front: Omit<SapSpec, "analyses" | "rules" | "populations" | "baseline_comparison" | "intercurrent_events" | "testing_hierarchy" | "subgroups" | "interim" | "steps" | "assumption_checks">,
  options: {
    answers?: string | null;
    onProgress?: (note: string) => void;
    onUsage?: (usage: TokenUsage) => void;
  } = {},
): Promise<MapResult> {
  const client = new Anthropic({ timeout: 30 * 60 * 1000, maxRetries: 3 });

  const content: Anthropic.ContentBlockParam[] = [
    {
      type: "text",
      text: `The study, already written:\n\n${JSON.stringify({
        title: front.title,
        design: front.design,
        picot: front.picot,
        aim: front.aim,
        hypothesis: front.hypothesis,
        estimand: front.estimand,
        objectives: front.objectives,
        variables: front.variables,
        outcomes: front.outcomes,
        sample_size: front.sample_size,
        expected_events: front.expected_events,
        priority_confounder_ids: front.priority_confounder_ids,
      })}`,
    },
  ];

  const decisions = decisionsBlock(options.answers, "plan");
  if (decisions) content.push({ type: "text", text: decisions });

  content.push({
    type: "text",
    text: `Write the analysis map. Number the tables T1 upward in the order the rows appear; they are provisional, because the shell tables decide the real numbering later.`,
  });

  options.onProgress?.("Writing the analysis map");

  const stream = client.messages.stream({
    model: MODEL,
  // Thinking counts against this, not only the JSON, so the budget covers the
  // reasoning as well as the registry it produces. The review and the case
  // report form have run at 64000 on this model since they were written; the
  // plan was left at half that, and stage one crossed it once the registry
  // grew a design family, a timepoint list and a derivation for every variable.
    max_tokens: 64000,
    thinking: { type: "adaptive" },
    output_config: { effort: EFFORT, format: { type: "json_schema", schema: SAP_MAP_JSON_SCHEMA } },
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

  if (message.stop_reason === "max_tokens") {
    throw new Error("The analysis map was cut off before it finished.");
  }

  const text = message.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");

  const raw = JSON.parse(text) as { analyses?: AnalysisRow[] };

  return {
    analyses: (raw.analyses ?? []).map((a) => ({
      ...a,
      objective_ids: a.objective_ids ?? [],
      outcome_ids: a.outcome_ids ?? [],
      exposure_ids: a.exposure_ids ?? [],
      adjust_for_ids: a.adjust_for_ids ?? [],
      table_ids: a.table_ids ?? [],
      pairing: a.pairing ?? "none",
      frequency: a.frequency || undefined,
      no_adjustment_reason: a.no_adjustment_reason?.trim() || undefined,
      test_override: a.test_override?.trim() || undefined,
      override_reason: a.override_reason?.trim() || undefined,
    })),
    model: message.model,
    usage: {
      input_tokens: message.usage.input_tokens,
      output_tokens: message.usage.output_tokens,
      cache_creation_input_tokens: message.usage.cache_creation_input_tokens ?? 0,
      cache_read_input_tokens: message.usage.cache_read_input_tokens ?? 0,
    },
  };
}
