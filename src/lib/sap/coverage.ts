import Anthropic from "@anthropic-ai/sdk";
import { MODEL } from "../protocol/analyze.ts";
import { explainApiError } from "../protocol/api-error.ts";
import type { TokenUsage } from "../protocol/pricing.ts";
import type { ExtractedProtocol } from "../protocol/extract.ts";
import type { SapSpec } from "./types.ts";
import type { Finding } from "./validate.ts";

/**
 * Reads the protocol back against the finished plan.
 *
 * Every other check in this application compares one of its own documents with
 * another: the form against the plan, the tables against the plan, the plan
 * against itself. Ninety-three of them, and not one reads the protocol. So a
 * variable the protocol describes and the plan never declared is invisible from
 * the moment the plan is written, and stays invisible through the form and the
 * tables, which faithfully report a plan that was already short.
 *
 * That is not a failure of the plan builder. It read the protocol once, under
 * the pressure of producing two registries and an analysis for each of them,
 * and what it did not notice then it cannot notice later. This is a second
 * reading with one question and nothing else to do.
 *
 * Nothing here is added to the plan. A variable the protocol mentions may
 * belong in the study or may not, and that is the investigator's judgement, so
 * each is reported with the protocol's own words and where they appear.
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

export const COVERAGE_JSON_SCHEMA = obj({
  omissions: {
    type: "array",
    description:
      "Everything the protocol says will be measured, recorded or collected that no variable in the plan covers. Empty when the plan covers everything, which is the expected answer for a well-read protocol: do not manufacture entries to appear thorough.",
    items: obj({
      what: {
        ...str,
        description:
          "The thing itself, in the plan's style: a short noun phrase such as 'Residual disease after cytoreduction' or 'ASA physical status grade'.",
      },
      quote: {
        ...str,
        description:
          "The protocol's own words, copied exactly, ten to thirty of them, so the reader can find the line and judge for themselves. Never paraphrase: a paraphrase cannot be checked against the document.",
      },
      where: {
        ...str,
        description:
          "Where it appears, as the protocol labels it: 'Methods, data collection', 'the proforma, item 14', 'Inclusion criteria'. Empty if the protocol has no usable label.",
      },
      role: {
        type: "string",
        enum: ["outcome", "predictor", "confounder", "descriptor", "unclear"],
        description:
          "What it would be if it were added. 'unclear' where the protocol mentions it without saying how it would be used, which is itself worth reporting.",
      },
      why_it_matters: {
        ...str,
        description:
          "One sentence on what is lost by leaving it out, specific to this study. Not 'it is important', but what analysis becomes impossible or what confounding goes unadjusted.",
      },
    }),
  },
});

const ROLE = `You are a senior medical research methodologist checking one thing.

An analysis plan has been written from a protocol. Your only question is what the
protocol says will be measured that the plan does not declare.

Read the protocol's methods, its data collection section, its proforma or case
record form if it has one, its outcome definitions and its inclusion criteria.
Against those, read the plan's variable and outcome registries. Report what is in
the first and not the second.

What counts as an omission:
- a measurement the protocol says will be taken, with no variable for it;
- an outcome the protocol names, with no outcome declared for it;
- a factor the protocol says will be adjusted for, controlled for, matched on or
  stratified by, with no variable for it;
- an item on the protocol's own proforma that no variable covers.

What does not count, and must not be reported:
- anything the plan already declares under a different wording. Read the plan's
  labels carefully before deciding something is missing: "Age" and "Age at
  presentation" are the same variable, and a false alarm costs the reader more
  than it is worth;
- background, rationale, references and the literature review, which describe
  what other studies measured and not what this one will;
- eligibility rules that only decide who enters, unless the protocol also says
  the value will be recorded;
- something you think the study ought to measure. That is a different question
  and this is not the place for it. Only what the protocol itself says.

Quote the protocol exactly. A finding a supervisor cannot check against the
document is a finding they have to take on trust, and they will not.

Return no omissions where there are none. A plan that read its protocol properly
is the normal case, and inventing entries to look diligent wastes the one
attention this document gets.`;

export type CoverageResult = {
  findings: Finding[];
  model: string;
  usage: TokenUsage;
};

type Omission = {
  what: string;
  quote: string;
  where: string;
  role: string;
  why_it_matters: string;
};

/** @returns COV01 findings, one per omission, or none. */
export async function checkCoverage(
  protocol: ExtractedProtocol,
  spec: SapSpec,
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
    onUsage?: (usage: TokenUsage) => void;
  } = {},
): Promise<CoverageResult> {
  const client = new Anthropic({ timeout: 30 * 60 * 1000, maxRetries: 3 });

  const content: Anthropic.ContentBlockParam[] = [
    protocol.kind === "pdf"
      ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: protocol.base64 } }
      : { type: "text", text: `<protocol filename="${protocol.filename}">\n${protocol.text}\n</protocol>` },
    {
      type: "text",
      text: `The plan written from it. Only the registries are given, because the
question is what they leave out:

${JSON.stringify({
        title: spec.title,
        design: spec.design,
        variables: (spec.variables ?? []).map((v) => ({
          id: v.id,
          label: v.label,
          data_type: v.data_type,
          unit_coding: v.unit_coding,
          role: v.role,
        })),
        outcomes: (spec.outcomes ?? []).map((o) => ({
          id: o.id,
          what: o.what,
          how: o.how,
          when: o.when,
        })),
      })}`,
    },
    {
      type: "text",
      text: `What does this protocol say will be measured that the plan above does not
declare? Read the plan's labels before deciding anything is missing.`,
    },
  ];

  options.onProgress?.("Reading the protocol back against the plan");

  const stream = client.messages.stream({
    model: MODEL,
    max_tokens: 32000,
    thinking: { type: "adaptive" },
    // Medium, not high. The reasoning that chose the analysis is done; this is
    // one comparison, and a longer think on it mostly produces more candidates,
    // which is the failure mode to avoid.
    output_config: { effort: "medium", format: { type: "json_schema", schema: COVERAGE_JSON_SCHEMA } },
    system: [{ type: "text", text: ROLE }],
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
    const explained = explainApiError(error);
    throw new Error(explained ?? (error instanceof Error ? error.message : "The coverage check failed."));
  }
  if (message.stop_reason === "max_tokens") {
    throw new Error("The coverage check was cut off before it finished.");
  }

  const text = message.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");

  const parsed = JSON.parse(text) as { omissions?: Omission[] };

  return {
    findings: toFindings(parsed.omissions ?? [], spec),
    model: message.model,
    usage: {
      input_tokens: message.usage.input_tokens,
      output_tokens: message.usage.output_tokens,
      cache_creation_input_tokens: message.usage.cache_creation_input_tokens ?? 0,
      cache_read_input_tokens: message.usage.cache_read_input_tokens ?? 0,
    },
  };
}

/**
 * One finding per omission, quoting the protocol.
 *
 * A warning and not an error. The plan may be right to leave something out, and
 * only the investigator knows: the finding's job is to make the decision
 * conscious, not to make it for them.
 */
export function toFindings(omissions: Omission[], spec: SapSpec): Finding[] {
  // Cheap insurance against the commonest false alarm, a variable the plan
  // already has under wording close enough that the check did not join them.
  const known = new Set(
    [
      ...(spec.variables ?? []).map((v) => v.label),
      ...(spec.outcomes ?? []).map((o) => o.what),
    ].map((label) => label.trim().toLowerCase()),
  );

  return omissions
    .filter((o) => o.what?.trim() && !known.has(o.what.trim().toLowerCase()))
    .map((o) => ({
      code: "COV01",
      severity: "WARN" as const,
      message:
        `The protocol says it will record "${o.what}", and no variable in the plan covers it` +
        `${o.where?.trim() ? ` (${o.where.trim()})` : ""}. ` +
        `It reads: "${o.quote.trim()}". ` +
        `${o.why_it_matters.trim()}` +
        `${o.role && o.role !== "unclear" ? ` It would be a ${o.role}.` : ""}`,
    }));
}
