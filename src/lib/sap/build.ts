import Anthropic from "@anthropic-ai/sdk";
import { loadKnowledge } from "../protocol/knowledge.ts";
import { explainApiError } from "../protocol/api-error.ts";
import { decisionsBlock, unresolvedBlock } from "../protocol/answers.ts";
import type { Consequence } from "../protocol/schema.ts";
import { DOCUMENT_MAX_TOKENS, EFFORT, MODEL } from "../protocol/analyze.ts";
import type { TokenUsage } from "../protocol/pricing.ts";
import type { ExtractedProtocol } from "../protocol/extract.ts";
import type { AnalysisRow, SapSpec } from "./types.ts";
import { validateSap, type Finding } from "./validate.ts";
import { chooseTest, plannedTests } from "./choose-test.ts";
import { buildSapMap } from "./map-stage.ts";
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
  design_family: {
    type: "string",
    enum: [
      "pre_post", "randomised_trial", "non_inferiority_trial", "crossover_trial",
      "cluster_trial", "factorial_trial", "cohort", "case_control", "cross_sectional",
      "descriptive_epidemiology", "diagnostic_accuracy", "agreement",
      "questionnaire_validation", "meta_analysis", "survival",
    ],
    description:
      "The same design as one of these, chosen to match what you wrote in design. It decides which estimate is valid and which tables the study owes: only an odds ratio is estimable from case_control sampling, a cross_sectional study reports a prevalence ratio, and a randomised design's baseline table carries no p values. Where a trial is also a crossover, a cluster or a factorial trial, choose that rather than randomised_trial; where it tests non-inferiority, choose non_inferiority_trial.",
  },
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
      intent: {
        type: "string",
        enum: ["descriptive", "causal"],
        description:
          "descriptive where the question is how much or how many, and the answer is a proportion, a mean or a rate reported as it stands. causal where the question is whether one thing brings another about, and the answer needs confounders held constant. 'What proportion developed sepsis' is descriptive; 'does the drug cause sepsis' is causal. Choose from the question the protocol actually asks, not from whether an adjusted model would be nice to have: a causal objective owes an adjusted estimate, and a descriptive one that carries one is claiming more than it asked.",
      },
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
      timepoints: {
        ...strArray,
        description:
          "When it is measured, in the study's own words: ['baseline'], ['baseline','day 30'], ['at discharge']. Empty for something recorded once at entry. The case report form is sectioned by this, so a variable measured after the intervention must say so or no follow-up section will exist to collect it.",
      },
      derived_from: {
        ...strArray,
        description:
          "The ids of the variables this is computed from, where it is not measured directly: a questionnaire subscale from its items, a change from its baseline and follow-up values, a ratio or an index from its parts. Each id must itself be a declared variable. Empty for anything measured directly. A score is never collected as a number; its items are collected and the score is computed, because a total the data collector arrives already holding was worked out somewhere nobody can check.",
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
});


const ROLE = `You are a senior medical research methodologist and trial statistician.

You are reading a protocol and writing the front of its Statistical Analysis Plan
as a route map: the clinical question decomposed, the estimand, the objectives
rewritten as answerable questions, and the two registries the rest of the plan
refers to - every variable with its role, and every outcome with all five of its
questions answered.

The analysis map is written next, from what you declare here, so a variable or an
outcome that is missing from these registries cannot be analysed at all.

Read every objective word by word. A word that cannot be measured must be replaced
by one that can. A word that claims more than the design supports must be softened
to what the design supports. An unnamed factor must be named, because a factor
nobody names is a factor nobody collects.

An outcome is not defined until five questions are answered: what exactly will be
measured, how, using which instrument, at what time, and in which units. Fold all
five into the outcome sentence.

A measure that is several numbers is several variables, not one. Parity written
as TPAL is four counts, term and preterm and abortions and living children, and
it is declared as four variables with data type count. An Apgar recorded at one,
five and ten minutes is three. A score with items is its items. Bundling them
into one variable makes it impossible to type: it is not nominal, because its
values cannot be listed, and the form has nowhere to put it but a text box.

A variable is only nominal or ordinal if its categories can be written out. If
you cannot list them, it is not categorical, and saying so now is what stops the
case report form collecting it as free text.

Do not name a statistical test anywhere. The application plans every analysis by
rule, so that the same study always yields the same plan.

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
    /**
     * The review's blockers that nobody answered. Carried whether or not they
     * were, because answering was built as an optional step and has never once
     * been taken.
     */
    unresolved?: Consequence[];
    /**
     * Stops the request where it is.
     *
     * A build runs for minutes and can be started by accident. Without this the
     * Stop button could only refuse to begin the next stage, and the call
     * already in flight would run to the end and be paid for.
     */
    signal?: AbortSignal;
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

  const unresolved = unresolvedBlock(options.unresolved ?? [], "plan");
  if (unresolved) content.push({ type: "text", text: unresolved });

  content.push({
    type: "text",
    text: `Write the analysis model for this protocol: the aim, the objectives as
answerable questions, and the variables and outcomes with their roles. The
analysis map is written next, from what you declare here.`,
  });

  options.onProgress?.("Reading the objectives and the variables");

  const stream = client.messages.stream({
    model: MODEL,
    max_tokens: DOCUMENT_MAX_TOKENS,
    thinking: { type: "adaptive" },
    output_config: { effort: EFFORT, format: { type: "json_schema", schema: SAP_JSON_SCHEMA } },
    system: [
      { type: "text", text: ROLE },
      { type: "text", text: loadKnowledge(), cache_control: { type: "ephemeral", ttl: "1h" } },
    ],
    messages: [{ role: "user", content }],
  }, { signal: options.signal });

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
    throw new SapError(
      "The plan was cut off while the registries were being written. The protocol may be unusually long, or may declare more variables than one pass can hold; try uploading the protocol without its appendices.",
    );
  }

  const text = message.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");

  const raw = JSON.parse(text) as SapSpec & { sample_size?: number; expected_events?: number };

  // Zero is the schema's way of saying "not stated"; carry it as absent.
  const frame = {
    ...raw,
    sample_size: raw.sample_size || undefined,
    expected_events: raw.expected_events || undefined,
    variables: (raw.variables ?? []).map((v) => ({
      ...v,
      exclusion_reason: v.exclusion_reason?.trim() || undefined,
    })),
    outcomes: raw.outcomes ?? [],
    priority_confounder_ids: raw.priority_confounder_ids ?? [],
  };

  // Running total, so the meter keeps climbing across all three calls rather
  // than resetting at each one.
  let spent = message.usage.output_tokens ?? 0;
  const report = (u: TokenUsage) =>
    options.onUsage?.({ ...u, output_tokens: spent + u.output_tokens });

  // The map is a second call because the first would not compile with it: the
  // frame, both registries and the map together were more grammar than the API
  // will take. It reads better this way in any case, since the map points at
  // ids the registries have already declared.
  const second = await buildSapMap(frame, {
    answers: options.answers,
    // Stage one declared the registries; the analyses are chosen here, which is
    // where most of a review's blockers actually land.
    unresolved: options.unresolved,
    onProgress: options.onProgress,
    onUsage: report,
  });
  spent += second.usage.output_tokens;

  // The analyses are planned here, by rule, before the third call. That is the
  // reason there is a third call: the assumptions belong to the analysis that
  // was chosen, and a model asked for both at once would be guessing at its own
  // output. Both halves of every plan, because an adjusted model's assumptions
  // are not the unadjusted estimate's.
  //
  // The plan is written onto the row and stored with it. It used to be computed
  // here, read once for the list below and thrown away, which left every reader
  // downstream to work it out again. The shell tables could not: they were sent
  // the analyses without a test and had to name the effect measure themselves,
  // and named an odds ratio for a common outcome, which is the one thing the
  // rule table says to avoid.
  const analyses = second.analyses.map((row) => {
    // The design decides which estimate is valid, so the rule table must be
    // able to see it. Copied onto the row rather than threaded through every
    // caller, the same way the chosen test is.
    const withDesign = {
      ...row,
      design_family: frame.design_family,
      frequency: inferFrequency(row, frame),
    };
    const plan = chooseTest(withDesign);
    if (!plan) return withDesign;
    return {
      ...withDesign,
      test: plan.unadjusted ?? undefined,
      test_adjusted: plan.adjusted ?? undefined,
      avoid: plan.avoid ?? undefined,
      measures: plan.measures,
    };
  });

  const front: Omit<SapSpec, keyof RulesResult["rules"]> = {
    ...frame,
    analyses,
  };

  // Every method by name, both branches of the normality decision included.
  // The stored `test` is a conditional sentence where there are two, and the
  // assumptions are stated per test, so they cannot be joined by that.
  const tests = [
    ...new Set(
      analyses.flatMap((row) => {
        const plan = chooseTest(row);
        return plan ? plannedTests(plan) : [];
      }),
    ),
  ];

  const third = await buildSapRules(front, tests, {
    answers: options.answers,
    unresolved: options.unresolved,
    onProgress: options.onProgress,
    onUsage: report,
  });

  const spec: SapSpec = { ...front, ...third.rules };

  // Judged here rather than at render time, so the findings are stored with the
  // plan and a problem is visible before anyone downloads it.
  const { findings } = validateSap(spec);

  return {
    spec,
    findings,
    model: message.model,
    usage: {
      input_tokens:
        message.usage.input_tokens + second.usage.input_tokens + third.usage.input_tokens,
      output_tokens:
        message.usage.output_tokens + second.usage.output_tokens + third.usage.output_tokens,
      cache_creation_input_tokens:
        (message.usage.cache_creation_input_tokens ?? 0) +
        second.usage.cache_creation_input_tokens +
        third.usage.cache_creation_input_tokens,
      cache_read_input_tokens:
        (message.usage.cache_read_input_tokens ?? 0) +
        second.usage.cache_read_input_tokens +
        third.usage.cache_read_input_tokens,
    },
  };
}

/**
 * How often the event happens, from the arithmetic where the plan left it open.
 *
 * The sample size calculation already assumed an event rate: expected events
 * over sample size is that rate. Leaving the field unknown sends the rule table
 * to its catch-all row, and the catch-all row's adjusted model is a logistic
 * regression, so one unfilled field is the whole distance between a risk ratio
 * and an odds ratio. The plan's own declaration wins where it made one; this
 * only fills a blank.
 */
function inferFrequency(row: AnalysisRow, frame: { sample_size?: number; expected_events?: number }) {
  if (row.data_type !== "binary") return row.frequency;
  if (row.frequency && row.frequency !== "unknown") return row.frequency;
  const { sample_size, expected_events } = frame;
  if (!sample_size || expected_events === undefined) return row.frequency;
  return expected_events / sample_size >= 0.1 ? ("common" as const) : ("rare" as const);
}
