import Anthropic from "@anthropic-ai/sdk";
import { loadKnowledge } from "./knowledge.ts";
import {
  MODEL_REVIEW_JSON_SCHEMA,
  modelReviewSchema,
  toActionSpec,
  toReviewSpec,
  type ActionSpec,
  type ReviewSpec,
} from "./schema.ts";
import type { ExtractedProtocol } from "./extract.ts";
import type { TokenUsage } from "./pricing.ts";
import { apiMessage, explainApiError } from "./api-error.ts";
import { DOCUMENT_MAX_TOKENS, type Mode, runMessage } from "../model/call.ts";

/**
 * The review model and effort.
 *
 * Opus 5 at `xhigh`: the strongest reasoning model this key can use at the
 * effort meant for work where getting it right matters more than the bill.
 *
 * It was Sonnet 5 at `high`, chosen when every build ran live and output was
 * ~70% of the bill. Two things moved. Builds are batched now, at half price,
 * and the aim was set plainly on 11 Sep 2026: the best results, with the
 * strongest model wherever reasoning happens. A review is critical appraisal -
 * the mismatch between what a protocol says it is and what it is - and that is
 * the reasoning this aim is about. Per thesis it costs about Rs 82 batched,
 * against Rs 33 on Sonnet 5.
 *
 * Fable 5.1 is more capable on paper and was not chosen: it costs twice as
 * much, its guidance warns that prompts as prescriptive as the reference files
 * here can lower its quality, and its refusal fallback cannot run in a batch.
 * A side-by-side on real protocols should decide that, not a price list.
 *
 * REVIEW_MODEL and REVIEW_EFFORT still override both.
 */
export const MODEL = process.env.REVIEW_MODEL ?? "claude-opus-5";
export const EFFORT = (process.env.REVIEW_EFFORT ?? "xhigh") as
  | "low"
  | "medium"
  | "high"
  | "xhigh"
  | "max";

/** Shared with the facts extraction, and explained where it is defined. */
export { DOCUMENT_MAX_TOKENS };

export type AnalysisResult = {
  /** The six-section narrative review. */
  spec: ReviewSpec;
  /** The short companion: the blockers only, as a numbered action table. */
  actionSpec: ActionSpec;
  model: string;
  effort: string;
  usage: TokenUsage;
};

export class AnalysisError extends Error {
  // Declared and assigned rather than a constructor parameter property: Node's
  // strip-only TypeScript mode, which the CLI scripts run under, rejects those.
  readonly cause?: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = "AnalysisError";
    this.cause = cause;
  }
}

const ROLE = `You are a senior medical research methodologist reviewing a postgraduate
research protocol. You have supervised hundreds of thesis protocols and you are known for
catching the mismatch between what a protocol says it is and what it actually is.

Follow the workflow and reference material below exactly. Return only the structured
review object described in the output contract.`;

function userContent(
  protocol: ExtractedProtocol,
): Anthropic.MessageParam["content"] {
  const instruction = {
    type: "text" as const,
    text: `The protocol to review was uploaded as "${protocol.filename}".

Work through your full internal analysis first — classify the design with Reference 1,
map objectives and outcomes with Reference 2, then check methodology and sample size with
Reference 3 — and check every row of the coverage table before you compose anything.

Then return the structured review.`,
  };

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

/** Re-exported: the implementation is shared with every other model call. */
export { apiMessage };

export async function analyzeProtocol(
  protocol: ExtractedProtocol,
  options: {
    /**
     * Stops the request where it is.
     *
     * A build runs for minutes and can be started by accident. Without this the
     * Stop button could only refuse to begin the next stage, and the call
     * already in flight would run to the end and be paid for.
     */
    signal?: AbortSignal;
    onProgress?: (note: string) => void;
    /** Fires as tokens accumulate, so the UI can show the job growing. */
    onUsage?: (usage: TokenUsage) => void;
    /** Live or batched. Defaults to whatever BUILD_MODE says. */
    mode?: Mode;
    /** Stores the batch id the moment it exists. See `model/call.ts`. */
    onBatch?: (id: string) => void | Promise<void>;
    /** A batch an earlier, dead build sent, to collect instead of re-buying. */
    resumeBatchId?: string | null;
  } = {},
): Promise<AnalysisResult> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new AnalysisError(
      "ANTHROPIC_API_KEY is not set. Add it to .env.local and restart the dev server.",
    );
  }

  const client = new Anthropic();
  const knowledge = loadKnowledge();

  options.onProgress?.("Reading the protocol");

  try {
    const { message, usage } = await runMessage(
      client,
      {
      model: MODEL,
      max_tokens: DOCUMENT_MAX_TOKENS,
      thinking: { type: "adaptive" },
      output_config: {
        effort: EFFORT,
        format: { type: "json_schema", schema: MODEL_REVIEW_JSON_SCHEMA },
      },
      // No cache breakpoint on the knowledge block, on purpose.
      //
      // It had one, with a 1-hour lifetime, on the reasoning that the block is
      // byte-identical on every request. It is, and it was never read: twelve
      // reviews in Supabase, 26,940 tokens written to the cache each time,
      // zero read back, because reviews run days apart and the entry expires
      // within the hour. A 1-hour write bills at twice the input rate, so each
      // review paid double for these tokens to buy nothing - about a tenth of
      // what a review costs. Batching does not change that: each build is its
      // own batch, sent when someone presses the button.
      //
      // The marker changes billing and nothing else; the model receives the
      // same bytes with or without it. Put it back when reviews start to run
      // within the same hour - the pricing page puts break-even for a 1-hour
      // entry at two reads per write - and check `cache_read_input_tokens` is
      // no longer zero. The block stays separate from the role so the marker
      // has somewhere to go.
      system: [
        { type: "text", text: ROLE },
        { type: "text", text: knowledge },
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
        label: "Analysing design, objectives and sample size",
      },
    );

    if (message.stop_reason === "refusal") {
      throw new AnalysisError(
        `The model declined to complete this review${
          message.stop_details?.explanation ? `: ${message.stop_details.explanation}` : "."
        }`,
      );
    }
    if (message.stop_reason === "max_tokens") {
      throw new AnalysisError(
        "The review was cut off before it finished. The protocol may be unusually long — try uploading only the protocol without appendices.",
      );
    }

    const text = message.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");

    if (!text.trim()) {
      throw new AnalysisError("The model returned an empty review.");
    }

    options.onProgress?.("Building the review document");

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (error) {
      throw new AnalysisError("The model's review was not valid JSON.", error);
    }

    const result = modelReviewSchema.safeParse(parsed);
    if (!result.success) {
      throw new AnalysisError(
        `The review was missing required content: ${result.error.issues
          .map((i) => i.path.join("."))
          .join(", ")}`,
        result.error,
      );
    }

    return {
      spec: toReviewSpec(result.data),
      actionSpec: toActionSpec(result.data),
      model: message.model,
      effort: EFFORT,
      usage,
    };
  } catch (error) {
    if (error instanceof AnalysisError) throw error;
    const explained = explainApiError(error);
    if (explained) throw new AnalysisError(explained, error);
    throw new AnalysisError(
      error instanceof Error ? error.message : "The analysis failed.",
      error,
    );
  }
}
