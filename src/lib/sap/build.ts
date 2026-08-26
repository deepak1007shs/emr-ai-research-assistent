import Anthropic from "@anthropic-ai/sdk";
import { loadKnowledge } from "../protocol/knowledge.ts";
import { explainApiError } from "../protocol/api-error.ts";
import { decisionsBlock } from "../protocol/answers.ts";
import { EFFORT, MODEL } from "../protocol/analyze.ts";
import type { TokenUsage } from "../protocol/pricing.ts";
import type { ExtractedProtocol } from "../protocol/extract.ts";
import type { SapSpec } from "./types.ts";
import { validateSap, type Finding } from "./validate.ts";
import { chooseTest } from "./choose-test.ts";
import { buildSapRules, type RulesResult } from "./rules-stage.ts";

/**
 * Builds the analysis model behind the SAP.
 *
 * One call. The model supplies the judgement - what each objective really asks,
 * what its outcome is, which variables are confounders rather than mediators -
 * and the code names the test. That split is deliberate: given the same row the
 * model would not always answer the same way, and a plan whose test depends on
 * the run is not a plan.
 */

export class SapError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SapError";
  }
}

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

export const SAP_JSON_SCHEMA = obj({
  title: { ...str, description: "The study title, corrected if the protocol's own is wrong." },
  design: { ...str, description: "The exact design, e.g. prospective observational cohort." },
  setting: { ...str, description: "Department and institution, as one line." },
  guideline: { ...str, description: "CONSORT, STROBE, STARD, TRIPOD, PRISMA." },
  picot: obj(
    {
      framework: {
        type: "string",
        enum: ["PICOT", "PECOT"],
        description: "PICOT when the investigator assigns the intervention, PECOT when they observe an exposure.",
      },
      population: str,
      intervention_or_exposure: str,
      comparator: {
        ...str,
        description: "Where there is no separate control group by design, say so and name the internal contrasts.",
      },
      outcome: str,
      time: { ...str, description: "When the outcome is ascertained, and the study type." },
      assembled_question: { ...str, description: "The whole clinical question as one sentence." },
    },
    "The clinical question decomposed. Every objective, variable and test below must trace back to it.",
  ),
  aim: { ...str, description: "One or two sentences: the overall purpose." },
  hypothesis: {
    ...str,
    description:
      "The expected direction, e.g. 'Intervention X increases outcome Y'. Where the study is purely descriptive, say that it is and that no directional hypothesis is stated.",
  },
  estimand: obj(
    {
      treatment_condition: { ...str, description: "The intervention or exposure conditions being compared." },
      population: { ...str, description: "The target patients, usually the primary analysis set." },
      endpoint: { ...str, description: "The primary outcome as measured." },
      intercurrent_strategy: {
        ...str,
        description:
          "How discontinuation, rescue therapy or death are handled: treatment-policy, hypothetical, composite, while-on-treatment or principal-stratum.",
      },
      summary_measure: { ...str, description: "The effect measure with its interval: difference in means, OR, HR." },
    },
    "The primary estimand, ICH E9(R1). All five attributes: the estimand, not the test, is what the study is trying to estimate.",
  ),
  sample_size: { type: "integer", description: "The total n the protocol states. 0 if absent." },
  expected_events: {
    type: "integer",
    description:
      "For a binary primary outcome, n multiplied by the expected proportion. 0 when the outcome is not binary or the proportion is unknown.",
  },
  sample_size_note: {
    ...str,
    description:
      "The minimal clinically important difference the study is powered to detect, its source, the assumed variability or event rate, alpha, power and the dropout allowance. A target n on its own is not a calculation. Where the protocol gives none, begin with 'TODO: ' and say what must be added.",
  },
  priority_confounder_ids: {
    ...strArray,
    description:
      "The variable ids adjustment will actually use, in priority order, respecting about ten outcome events per variable. Fewer than the candidate list where the events do not afford them.",
  },
  objectives: {
    type: "array",
    description:
      "Read each protocol objective word by word before writing it. 'Study' and 'evaluate' are not measurable and become estimate, compare or determine. 'Leading to' and 'effect of' claim causation an observational design cannot support and become 'associated with'. Unnamed factors must be named. Exactly one primary, id P1; secondaries S1, S2, S3.",
    items: obj({
      id: { ...str, description: "P1, P2, S1, S2, E1..." },
      tier: { type: "string", enum: ["primary", "secondary", "exploratory"] },
      question: { ...str, description: "Phrased as a question, so it names an outcome and a predictor." },
    }),
  },
  variables: {
    type: "array",
    description:
      "The registry. Every variable is declared exactly once here with an id, and everything else refers to that id. Outcomes first, then predictors, then confounders, then descriptors. A mediator lies on the path between exposure and outcome; a collider is caused by the outcome. Both must be named as such and excluded from every model.",
    items: obj({
      id: { ...str, description: "var_age, var_bmi. Lower case, begins var_, unique." },
      label: { ...str, description: "The single authoritative wording. No two variables share a label." },
      data_type: {
        type: "string",
        enum: ["binary", "continuous", "ordinal", "nominal", "count", "time_to_event"],
      },
      unit_coding: { ...str, description: "Years, mmHg, Yes / No, I / II / III." },
      role: {
        type: "string",
        enum: ["outcome", "predictor", "confounder", "effect_modifier", "mediator", "collider", "descriptor"],
      },
      exclusion_reason: {
        ...str,
        description: "Required for a mediator or collider: why adjusting for it would be wrong. Empty otherwise.",
      },
    }),
  },
  outcomes: {
    type: "array",
    description:
      "The outcome registry. Each is declared once with an id, and analyses refer to that id. Every outcome answers all five questions.",
    items: obj({
      id: { ...str, description: "out_conversion. Lower case, begins out_, unique." },
      what: {
        ...str,
        description:
          "The outcome's NAME: two to eight words, e.g. 'Intraoperative conversion' or 'Postoperative length of stay'. This is the wording that prints as a table heading and as a field label on the case report form, so it must be short. The detail belongs in how.",
      },
      how: {
        ...str,
        description:
          "How it will be measured, in full. This is where the definition goes: what counts as an event, what the threshold is, who records it.",
      },
      instrument: { ...str, description: "Using which instrument, form, scale or record." },
      when: { ...str, description: "At what time point." },
      units: { ...str, description: "In which units, or the category set." },
      domain: {
        type: "string",
        enum: ["clinical", "laboratory", "radiological", "functional", "patient_reported", "economic", "composite"],
        description: "The second classification every outcome carries, alongside its rank.",
      },
      source_variable_ids: {
        ...strArray,
        description: "The ids of the variables that measure it. Each must be in the variable registry.",
      },
    }),
  },
  analyses: {
    type: "array",
    description:
      "One row per objective, in the order of the objectives. Refer to outcomes and variables by id, never by repeating their words. Do NOT name a statistical test: the test is chosen from the data type and the comparison by the application, so that it is the same every time.",
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

You are reading a protocol and writing the front half of its Statistical Analysis
Plan as a route map: what the study is at a glance, the clinical question
decomposed, the estimand, the objectives rewritten as answerable questions, the
variable table, and the analysis map that links each question to its outcome, its
predictors and the table it will fill.

Read every objective word by word. A word that cannot be measured must be replaced
by one that can. A word that claims more than the design supports must be softened
to what the design supports. An unnamed factor must be named, because a factor
nobody names is a factor nobody collects.

An outcome is not defined until five questions are answered: what exactly will be
measured, how, using which instrument, at what time, and in which units. Fold all
five into the outcome sentence.

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

One row may answer several objectives where the analysis is identical, and one
row usually fills more than one table: the unadjusted estimate, the adjusted
model, and any sensitivity table beside them.

Declare every variable and every outcome exactly once, each with an id, and refer
to them by that id everywhere else. The case report form and the shell tables will
point at the same ids, so a concept named once here is named once in all three
documents.

Where the protocol does not state something the plan needs, do not invent it and do
not leave it blank. Write what it should say, opening with "TODO: ", so the
investigator can see exactly what is missing and settle it with their guide. A
sample size with no stated assumptions, an outcome scale with no cut-off and a
missing-data method nobody chose are the three that matter most.`;

export type SapResult = {
  spec: SapSpec;
  findings: Finding[];
  model: string;
  usage: TokenUsage;
};

export async function buildSapSpec(
  protocol: ExtractedProtocol,
  options: {
    answers?: string | null;
    onProgress?: (note: string) => void;
    onUsage?: (usage: TokenUsage) => void;
  } = {},
): Promise<SapResult> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new SapError("ANTHROPIC_API_KEY is not set.");
  }

  const client = new Anthropic({ timeout: 30 * 60 * 1000, maxRetries: 3 });
  const content: Anthropic.ContentBlockParam[] = [
    protocol.kind === "pdf"
      ? {
          type: "document",
          source: { type: "base64", media_type: "application/pdf", data: protocol.base64 },
        }
      : {
          type: "text",
          text: `<protocol filename="${protocol.filename}">\n${protocol.text}\n</protocol>`,
        },
  ];

  const decisions = decisionsBlock(options.answers, "plan");
  if (decisions) content.push({ type: "text", text: decisions });

  content.push({
    type: "text",
    text: `Write the analysis model for this protocol: the aim, the objectives as
answerable questions, the variables with their roles, and one analysis row per
objective. Number the tables T1 upward in the order the rows appear.`,
  });

  options.onProgress?.("Reading the objectives and writing the analysis map");

  const stream = client.messages.stream({
    model: MODEL,
    max_tokens: 32000,
    thinking: { type: "adaptive" },
    output_config: { effort: EFFORT, format: { type: "json_schema", schema: SAP_JSON_SCHEMA } },
    system: [
      { type: "text", text: ROLE },
      { type: "text", text: loadKnowledge(), cache_control: { type: "ephemeral", ttl: "1h" } },
    ],
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
    // Said in words. Without this the raw JSON body reaches the screen.
    const explained = explainApiError(error);
    if (explained) throw new SapError(explained);
    throw error;
  }

  if (message.stop_reason === "max_tokens") {
    throw new SapError("The plan was cut off before it finished.");
  }

  const text = message.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");

  const raw = JSON.parse(text) as SapSpec & { sample_size?: number; expected_events?: number };

  // Zero is the schema's way of saying "not stated"; carry it as absent.
  const front: Omit<SapSpec, keyof RulesResult["rules"]> = {
    ...raw,
    sample_size: raw.sample_size || undefined,
    expected_events: raw.expected_events || undefined,
    variables: (raw.variables ?? []).map((v) => ({
      ...v,
      exclusion_reason: v.exclusion_reason?.trim() || undefined,
    })),
    outcomes: raw.outcomes ?? [],
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
    priority_confounder_ids: raw.priority_confounder_ids ?? [],
  };

  // The tests are chosen here, by rule, before the second call. That is the
  // reason there is a second call: the assumptions belong to the test that was
  // chosen, and a model asked for both at once would be guessing at its own
  // output.
  // Both halves of every plan, because the assumptions of an adjusted model are
  // not the assumptions of the unadjusted estimate beside it.
  const tests = [
    ...new Set(
      front.analyses.flatMap((row) => {
        const plan = chooseTest(row);
        if (!plan) return [];
        return [plan.unadjusted, plan.adjusted].filter((t): t is string => Boolean(t));
      }),
    ),
  ];

  const second = await buildSapRules(front, tests, {
    answers: options.answers,
    onProgress: options.onProgress,
    onUsage: (u) =>
      options.onUsage?.({
        ...u,
        output_tokens: (message.usage.output_tokens ?? 0) + u.output_tokens,
      }),
  });

  const spec: SapSpec = { ...front, ...second.rules };

  // Judged here rather than at render time, so the findings are stored with the
  // plan and a problem is visible before anyone downloads it.
  const { findings } = validateSap(spec);

  return {
    spec,
    findings,
    model: message.model,
    usage: {
      input_tokens: message.usage.input_tokens + second.usage.input_tokens,
      output_tokens: message.usage.output_tokens + second.usage.output_tokens,
      cache_creation_input_tokens:
        (message.usage.cache_creation_input_tokens ?? 0) + second.usage.cache_creation_input_tokens,
      cache_read_input_tokens:
        (message.usage.cache_read_input_tokens ?? 0) + second.usage.cache_read_input_tokens,
    },
  };
}
