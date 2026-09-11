import Anthropic from "@anthropic-ai/sdk";
import type { ExtractedProtocol } from "../protocol/extract.ts";
import { apiMessage, explainApiError } from "../protocol/api-error.ts";
import { DOCUMENT_MAX_TOKENS, type Mode, runMessage } from "../model/call.ts";
import type { TokenUsage } from "../protocol/pricing.ts";
import type { FactsSheet } from "../study/types.ts";
import { z } from "zod";
import { addUsage } from "../protocol/pricing.ts";
import { FACTS_JSON_SCHEMA, factsSchema } from "./schema.ts";

/**
 * The one model call the plan makes, and the last judgement in the pipeline.
 *
 * Everything after this is rules over the object it returns. That is the whole
 * repair: the build this replaced asked a model six times, once per step, and
 * the same protocol came back with sixteen tables on one run and twenty on the
 * next because nothing held the answers still between the questions.
 *
 * So the prompt asks for facts and refuses decisions. "What does the primary
 * outcome measure, in what unit, at which visits" is a fact a reader can point
 * at in the protocol. "Which test should it get" is not, and is not asked here
 * or anywhere else a model can hear it.
 */

/**
 * The strongest reasoning model this key can use, at the effort meant for work
 * where being right matters more than the bill.
 *
 * Of the two model calls in the application this is the one where that matters
 * most. A misreading here - the design, an outcome's type, a visit the outcome
 * is measured at - reaches every table, and the tables stay consistent with each
 * other while being wrong, so none of the 43 checks can see it. Gate A's
 * dictionary check also asks the model to use one name for one thing across
 * five sections of its answer, which is exactly the kind of care the stronger
 * model is better at.
 *
 * FACTS_MODEL and FACTS_EFFORT still override both. See `protocol/analyze.ts`
 * for why this is Opus 5 and not Fable 5.1.
 */
export const MODEL = process.env.FACTS_MODEL ?? "claude-opus-5";
export const EFFORT = (process.env.FACTS_EFFORT ?? "xhigh") as
  | "low"
  | "medium"
  | "high"
  | "xhigh"
  | "max";

export class ExtractionError extends Error {
  readonly cause?: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = "ExtractionError";
    this.cause = cause;
  }
}

export type ExtractionResult = {
  facts: FactsSheet;
  model: string;
  effort: string;
  usage: TokenUsage;
};

const ROLE = `You are a senior medical statistician reading a research protocol so that a
statistical analysis plan can be built from it. You have read hundreds of postgraduate
protocols and you know that most of what they leave out, they leave out silently.

Your job is to record what the protocol says, and to record clearly what it does not say.
You do not choose statistical tests, models, effect measures or table layouts: those are
decided by fixed rules from the facts you record, and a decision taken here would be taken
differently the next time this protocol is read.

Three habits matter more than anything else.

Never invent a value. Where the protocol does not give a cut-off, a definition, a version
or a proportion, it goes in open_items as a question for the investigator. A plausible
number filled in here becomes a number in a finished document that nobody can trace.

Name everything once and reuse the name. The measure dictionary is the list of every
distinct thing the study records. The visit schedule, the outcomes, the covariates and the
proforma all refer to those names and to nothing else. A name that appears in one place and
not in the dictionary gets no field on the form and no row in any table, and neither
absence is visible in the finished document.

Read the schedule, not only the outcome sentence. A protocol whose primary outcome is
"change in haemoglobin from day 0 to week 6" and whose schedule draws blood at weeks 2 and
4 as well is a study that can answer how fast the value moves, and the outcome's time list
is all four visits rather than the two endpoints.`;

const INSTRUCTION = `Record the Locked Protocol Facts Sheet for this protocol.

Work through it in this order before you write anything.

1. What kind of study is this, judged by what was done rather than by what the protocol
   calls itself. A timing word such as "prospective" names no design: a prospective study
   can be a trial, a cohort or a case series, and each owes different tables.
2. Who is studied, what is given or observed, and against what.
3. Every distinct thing the study records, as the measure dictionary: its name, how it is
   written on a form, its type, its unit or its list of categories, which descriptive table
   it belongs to, and whether it is computed from other measures.
4. The visit schedule, naming measures from the dictionary and nothing else. Enrolment
   records the descriptors and the administrative items as well as the outcomes.
5. The primary outcome, walked all the way down: what, how, with which instrument, at which
   visits, in what unit, of what type, what its values are expected to look like, and, for
   a binary outcome, how common it is expected to be.
6. Each secondary outcome the same way, including any that appears only in the methods.
7. Anything in the aims or the hypothesis that is not a formal objective, as an exploratory
   idea: the question, what kind it is, the outcome it is asked of and the other measures it
   involves. The hypothesis often names a variable the study never collects, and that is
   exactly what this field is for.
8. The covariates an adjusted model would hold constant, and the proforma triaged item by
   item.
9. The sample size as it stands, and every question still waiting for the investigator.

Then return the Facts Sheet as one JSON object that matches the schema in your
instructions exactly.`;

/**
 * The shape of the answer, given to the model as text rather than as a grammar.
 *
 * It was a grammar - `output_config.format` - and the first real run showed the
 * API cannot compile it: "The compiled grammar is too large". Removing every
 * description and every enum did not bring it under the limit, nor did removing
 * five whole sections; the Facts Sheet is simply more structure than
 * constrained decoding will hold. The review's much smaller schema compiles
 * and keeps its grammar.
 *
 * So the schema is stated here and the parser holds the model to it, which is
 * what it always did: the grammar guaranteed the shape, and `factsSchema`
 * checked the shape again regardless. What the grammar did that this does not
 * is make a malformed answer impossible, so a malformed answer gets one repair
 * (below) instead.
 */
const CONTRACT = `Return exactly one JSON object, and nothing else: no prose before or after it, no
code fence around it.

It must match this JSON Schema. Every property listed is required, at every depth. Where
the protocol does not say something that is a text field, write an empty string; where
the schema allows null, write null. Never omit a key, and never add one.

${JSON.stringify(FACTS_JSON_SCHEMA)}`;

/**
 * The JSON object in what came back.
 *
 * The model is told to return bare JSON, and nearly always does. A code fence
 * or a sentence around it is not a reason to throw away a Facts Sheet that was
 * read and paid for, so the object is taken from the first brace to the last.
 */
export function readJson(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) throw new SyntaxError("No JSON object in the answer.");
  return JSON.parse(text.slice(start, end + 1));
}

/** A Facts Sheet from an answer, or the reasons there is none. */
function check(text: string): { facts: FactsSheet | null; problems: string[] } {
  let parsed: unknown;
  try {
    parsed = readJson(text);
  } catch (error) {
    return {
      facts: null,
      problems: [`The answer is not a JSON object: ${(error as Error).message}`],
    };
  }
  const result = factsSchema.safeParse(parsed);
  return result.success
    ? { facts: result.data as FactsSheet, problems: [] }
    : { facts: null, problems: issuesOf(result.error) };
}

/** The first few ways an answer misses the schema, in words a model can act on. */
function issuesOf(error: z.ZodError): string[] {
  return error.issues
    .slice(0, 25)
    .map((issue) => `${issue.path.join(".") || "(top level)"}: ${issue.message}`);
}

function userContent(
  protocol: ExtractedProtocol,
): Anthropic.MessageParam["content"] {
  const instruction = { type: "text" as const, text: INSTRUCTION };

  if (protocol.kind === "pdf") {
    return [
      {
        type: "document",
        source: {
          type: "base64",
          media_type: "application/pdf",
          data: protocol.base64,
        },
      },
      instruction,
    ];
  }

  return [
    {
      type: "text",
      text: `<protocol filename="${protocol.filename}">\n${protocol.text}\n</protocol>`,
    },
    instruction,
  ];
}

export async function extractFacts(
  protocol: ExtractedProtocol,
  options: {
    signal?: AbortSignal;
    onProgress?: (note: string) => void;
    onUsage?: (usage: TokenUsage) => void;
    /** Live or batched. Defaults to whatever BUILD_MODE says. */
    mode?: Mode;
    /** Stores the batch id the moment it exists. See `model/call.ts`. */
    onBatch?: (id: string) => void | Promise<void>;
    /** A batch an earlier, dead build sent, to collect instead of re-buying. */
    resumeBatchId?: string | null;
  } = {},
): Promise<ExtractionResult> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new ExtractionError(
      "ANTHROPIC_API_KEY is not set. Add it to .env.local and restart the dev server.",
    );
  }

  const client = new Anthropic();
  options.onProgress?.("Reading the protocol");

  try {
    const { message, usage } = await runMessage(
      client,
      {
        model: MODEL,
        max_tokens: DOCUMENT_MAX_TOKENS,
        thinking: { type: "adaptive" },
        output_config: { effort: EFFORT },
        system: [
          { type: "text", text: ROLE },
          { type: "text", text: CONTRACT },
        ],
        messages: [{ role: "user", content: userContent(protocol) }],
      },
      {
        signal: options.signal,
        onProgress: options.onProgress,
        onUsage: options.onUsage,
        mode: options.mode,
        onBatch: options.onBatch,
        resumeBatchId: options.resumeBatchId,
        label: "Recording the design, the outcomes and the variables",
      },
    );

    if (message.stop_reason === "refusal") {
      throw new ExtractionError(
        `The model declined to read this protocol${
          message.stop_details?.explanation
            ? `: ${message.stop_details.explanation}`
            : "."
        }`,
      );
    }
    if (message.stop_reason === "max_tokens") {
      throw new ExtractionError(
        "Reading the protocol was cut off before it finished. Try uploading the protocol without its appendices.",
      );
    }

    const text = message.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");

    if (!text.trim()) throw new ExtractionError("The model returned nothing.");

    let { facts, problems } = check(text);
    let spent = usage;

    // One repair, for an answer that missed the schema. Without a grammar a
    // malformed answer is possible, and it arrives after the protocol has been
    // read and the reasoning paid for. The repair sends back only the answer
    // and what is wrong with it - not the protocol, which is most of the cost -
    // and is told to change nothing else. It is a question about structure, so
    // it is asked at a lower effort.
    if (!facts) {
      options.onProgress?.("Correcting the shape of the answer");
      const repaired = await runMessage(
        client,
        {
          model: MODEL,
          max_tokens: DOCUMENT_MAX_TOKENS,
          thinking: { type: "adaptive" },
          output_config: { effort: "medium" },
          system: [
            { type: "text", text: ROLE },
            { type: "text", text: CONTRACT },
          ],
          messages: [
            {
              role: "user",
              content: `This Facts Sheet does not match the schema. Correct it and return the whole object.

Change only what the problems below name. Do not re-read, re-judge or re-word anything
else: every value that is not named here stays exactly as it is.

Problems:
${problems.map((p) => `- ${p}`).join("\n")}

The Facts Sheet:
${text}`,
            },
          ],
        },
        {
          signal: options.signal,
          onProgress: options.onProgress,
          mode: options.mode,
          label: "Correcting the shape of the answer",
        },
      );
      spent = addUsage(spent, repaired.usage);
      options.onUsage?.(spent);

      const repairedText = repaired.message.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("");
      ({ facts, problems } = check(repairedText));

      if (!facts) {
        throw new ExtractionError(
          `The facts did not match the contract, even after one repair: ${problems
            .slice(0, 3)
            .join("; ")}`,
        );
      }
    }

    // Gate A is not checked here. It used to be, and it threw: the Facts Sheet
    // had been read and paid for, and the error carried only the gate's
    // messages, so the facts were lost and a rebuild paid again to read the
    // same protocol - most likely into the same failure. This function reads
    // the protocol; the runner decides what the reading permits, and keeps it
    // either way. Gate A stays a hard stop there: no table is built on a
    // design or a primary outcome that is not settled.
    options.onProgress?.("The facts are read");

    return {
      facts,
      model: MODEL,
      effort: EFFORT,
      usage: spent,
    };
  } catch (error) {
    if (error instanceof ExtractionError) throw error;
    const said =
      explainApiError(error) ??
      (error instanceof Error ? apiMessage(error) : "The model call failed.");
    throw new ExtractionError(said, error);
  }
}
