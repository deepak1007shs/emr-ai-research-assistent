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

/**
 * SDK error messages often carry the raw JSON body. Pull out the human-readable
 * part so a wall of JSON never reaches the screen.
 *
 * Exported for testing only.
 */
export function apiMessage(error: { message: string }): string {
  const match = error.message.match(/"message"\s*:\s*"((?:[^"\\]|\\.)*)"/);
  if (!match) return error.message;
  try {
    return JSON.parse(`"${match[1]}"`);
  } catch {
    return match[1];
  }
}

export async function analyzeProtocol(
  protocol: ExtractedProtocol,
  options: {
    onProgress?: (note: string) => void;
    /** Fires as tokens accumulate, so the UI can show the job growing. */
    onUsage?: (usage: TokenUsage) => void;
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
    const stream = client.messages.stream({
      model: MODEL,
      max_tokens: 64000,
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
    });

    let announced = false;
    const running: TokenUsage = {
      input_tokens: 0,
      output_tokens: 0,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
    };

    stream.on("streamEvent", (event) => {
      if (!announced) {
        announced = true;
        options.onProgress?.("Analysing design, objectives and sample size");
      }

      // message_start carries the input side; message_delta carries a running
      // output count. Together they let the UI show the bill as it accrues.
      if (event.type === "message_start") {
        const u = event.message.usage;
        running.input_tokens = u.input_tokens ?? 0;
        running.cache_creation_input_tokens = u.cache_creation_input_tokens ?? 0;
        running.cache_read_input_tokens = u.cache_read_input_tokens ?? 0;
        options.onUsage?.({ ...running });
      } else if (event.type === "message_delta") {
        running.output_tokens = event.usage.output_tokens ?? running.output_tokens;
        options.onUsage?.({ ...running });
      }
    });

    const message = await stream.finalMessage();

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
      usage: {
        input_tokens: message.usage.input_tokens,
        output_tokens: message.usage.output_tokens,
        cache_creation_input_tokens: message.usage.cache_creation_input_tokens ?? 0,
        cache_read_input_tokens: message.usage.cache_read_input_tokens ?? 0,
      },
    };
  } catch (error) {
    if (error instanceof AnalysisError) throw error;
    if (error instanceof Anthropic.AuthenticationError) {
      throw new AnalysisError("The Anthropic API key was rejected. Check ANTHROPIC_API_KEY.", error);
    }
    if (error instanceof Anthropic.RateLimitError) {
      throw new AnalysisError("Rate limited by the Anthropic API. Wait a moment and try again.", error);
    }
    if (error instanceof Anthropic.BadRequestError) {
      // Billing failures arrive as a 400 with the reason buried in a JSON blob.
      // Say the actionable thing instead of putting that on screen.
      if (/credit balance is too low/i.test(error.message)) {
        throw new AnalysisError(
          "The Anthropic account has no credit left. Add credits at console.anthropic.com/settings/billing, then try again. (API credits are separate from a Claude.ai subscription.)",
          error,
        );
      }
      throw new AnalysisError(`The API rejected the request: ${apiMessage(error)}`, error);
    }
    if (error instanceof Anthropic.APIError) {
      throw new AnalysisError(
        `Anthropic API error ${error.status}: ${apiMessage(error)}`,
        error,
      );
    }
    throw new AnalysisError(
      error instanceof Error ? error.message : "The analysis failed.",
      error,
    );
  }
}
