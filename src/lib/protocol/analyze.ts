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
import { type Mode, runMessage, usageOf } from "../model/call.ts";

/**
 * The review model and effort.
 *
 * Sonnet 5 at `high` was chosen deliberately over Opus 5 at `xhigh`: output
 * tokens are ~70% of the bill, so thinking depth and output rate dominate the
 * cost, not the size of the protocol. Override per environment if a particular
 * protocol deserves more reasoning.
 */
export const MODEL = process.env.REVIEW_MODEL ?? "claude-sonnet-5";
export const EFFORT = (process.env.REVIEW_EFFORT ?? "high") as
  | "low"
  | "medium"
  | "high"
  | "xhigh"
  | "max";

/**
 * The output budget every call that writes a document is given.
 *
 * Thinking is drawn from this, not only the JSON, so the budget covers the
 * reasoning as well as what it produces. One number, because the alternative
 * has failed twice: the plan's first stage was left at half and crossed it once
 * the variable registry grew a design family, a timepoint list and a derivation
 * for each variable; the shell tables were left at half and crossed it on a
 * plan with seventy-eight variables, where every one of them is a row in the
 * descriptive tables. Both were found by a study that was merely large.
 *
 * A follow-up call is a different thing and sets its own. Placing finished
 * fields on a form, or reading one document back against another, is a smaller
 * question asked at a lower effort, and those calls say so where they are made.
 */
export const DOCUMENT_MAX_TOKENS = 64000;

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
    const message = await runMessage(
      client,
      {
      model: MODEL,
      max_tokens: DOCUMENT_MAX_TOKENS,
      thinking: { type: "adaptive" },
      output_config: {
        effort: EFFORT,
        format: { type: "json_schema", schema: MODEL_REVIEW_JSON_SCHEMA },
      },
      // The knowledge block is byte-identical on every request, so it sits
      // behind a cache breakpoint; the protocol itself follows in `messages`
      // and never invalidates it.
      system: [
        { type: "text", text: ROLE },
        {
          type: "text",
          text: knowledge,
          cache_control: { type: "ephemeral", ttl: "1h" },
        },
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
      usage: usageOf(message),
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
