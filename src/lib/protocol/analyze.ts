import Anthropic from "@anthropic-ai/sdk";
import { loadKnowledge } from "./knowledge";
import {
  MODEL_REVIEW_JSON_SCHEMA,
  modelReviewSchema,
  toReviewSpec,
  type ReviewSpec,
} from "./schema";
import type { ExtractedProtocol } from "./extract";

export const MODEL = "claude-opus-5";

export type AnalysisResult = {
  spec: ReviewSpec;
  model: string;
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens: number;
    cache_read_input_tokens: number;
  };
};

export class AnalysisError extends Error {
  constructor(
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "AnalysisError";
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

export async function analyzeProtocol(
  protocol: ExtractedProtocol,
  options: { onProgress?: (note: string) => void } = {},
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
        effort: "xhigh",
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
    stream.on("streamEvent", () => {
      if (!announced) {
        announced = true;
        options.onProgress?.("Analysing design, objectives and sample size");
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
      model: message.model,
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
      throw new AnalysisError(`The API rejected the request: ${error.message}`, error);
    }
    if (error instanceof Anthropic.APIError) {
      throw new AnalysisError(`Anthropic API error ${error.status}: ${error.message}`, error);
    }
    throw new AnalysisError(
      error instanceof Error ? error.message : "The analysis failed.",
      error,
    );
  }
}
