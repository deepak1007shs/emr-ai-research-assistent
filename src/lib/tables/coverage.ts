import Anthropic from "@anthropic-ai/sdk";
import { MODEL } from "../protocol/analyze.ts";
import { explainApiError } from "../protocol/api-error.ts";
import type { TokenUsage } from "../protocol/pricing.ts";
import type { ExtractedProtocol } from "../protocol/extract.ts";
import type { Finding } from "../sap/validate.ts";
import type { ShellTablesSpec } from "./types.ts";

/**
 * Reads the protocol back against the finished table list.
 *
 * The document's own coverage check runs both directions between the objectives
 * and the tables, and code can do that in full because both halves are ids. It
 * cannot do the direction that matters most: the protocol promises to report
 * things the plan never turned into an objective, and a table list built from
 * the plan alone is faithful to a plan that was already short.
 *
 * The same second reading the analysis plan gets, with one question and nothing
 * else to do. Nothing is added to the document: whether a promised table belongs
 * in this study is the investigator's judgement, so each is reported with the
 * protocol's own words.
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

export const TABLE_COVERAGE_JSON_SCHEMA = obj({
  omissions: {
    type: "array",
    description:
      "Everything the protocol says it will report, compare, describe or tabulate that no table in the list reports. Empty when the list covers everything, which is the expected answer for a well-read protocol: do not manufacture entries to appear thorough.",
    items: obj({
      what: {
        ...str,
        description:
          "The result itself, as a table would be titled: 'Antibiotic sensitivity pattern of the isolates', 'Complication rate by operative approach'.",
      },
      quote: {
        ...str,
        description:
          "The protocol's own words, copied exactly, ten to thirty of them, so the reader can find the line and judge for themselves. Never paraphrase: a paraphrase cannot be checked against the document.",
      },
      where: {
        ...str,
        description:
          "Where it appears, as the protocol labels it: 'Methods, outcome assessment', 'Objectives', 'the proforma, item 14'. Empty if the protocol has no usable label.",
      },
      block: {
        ...str,
        description:
          "Which section it would belong to: descriptive, primary, secondary or exploratory. Use 'unclear' where the protocol does not say.",
      },
      why_it_matters: {
        ...str,
        description:
          "One sentence on what the thesis is missing without this table, in the investigator's terms, not the statistician's.",
      },
    }),
  },
});

const ROLE = `You are checking a table plan against the protocol it came from.

You are given the protocol and the list of tables the study will report. One
question: what does the protocol say it will report that no table in the list
reports?

Read the table titles and what each table's rows and columns hold before deciding
anything is missing. A result reported inside an existing table is not missing.
A result the protocol mentions only as background, or as something another study
found, is not missing either: it must be something THIS study says it will report.

Most protocols will have one or two. Some will have none, and none is a complete
answer. Do not pad the list.`;

export type TableCoverageResult = {
  findings: Finding[];
  model: string;
  usage: TokenUsage;
};

type Omission = {
  what: string;
  quote: string;
  where: string;
  block: string;
  why_it_matters: string;
};

/** @returns TBLCOV01 findings, one per omission, or none. */
export async function checkTableCoverage(
  protocol: ExtractedProtocol,
  spec: ShellTablesSpec,
  options: {
    onProgress?: (note: string) => void;
    onUsage?: (usage: TokenUsage) => void;
  } = {},
): Promise<TableCoverageResult> {
  const client = new Anthropic({ timeout: 30 * 60 * 1000, maxRetries: 3 });

  const content: Anthropic.ContentBlockParam[] = [
    protocol.kind === "pdf"
      ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: protocol.base64 } }
      : { type: "text", text: `<protocol filename="${protocol.filename}">\n${protocol.text}\n</protocol>` },
    {
      type: "text",
      text: `The tables planned from it. Each says what runs down its side and what
runs across its top, which is what tells you whether a result is already
reported somewhere:

${JSON.stringify(
        (spec.tables ?? []).map((t) => ({
          number: t.number,
          block: t.block,
          title: t.title,
          rows: t.rows.map((r) => (r.variable_id ? spec.labels?.[r.variable_id] ?? r.label : r.label)),
          columns: t.columns,
        })),
      )}`,
    },
    {
      type: "text",
      text: `What does this protocol say it will report that no table above reports?`,
    },
  ];

  options.onProgress?.("Reading the protocol back against the tables");

  const stream = client.messages.stream({
    model: MODEL,
    max_tokens: 16000,
    thinking: { type: "adaptive" },
    output_config: {
      effort: "medium",
      format: { type: "json_schema", schema: TABLE_COVERAGE_JSON_SCHEMA },
    },
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
 * A warning and not an error. The document may be right to leave a result out,
 * and only the investigator knows: the finding's job is to make the decision
 * conscious, not to make it for them.
 */
export function toFindings(omissions: Omission[], spec: ShellTablesSpec): Finding[] {
  // Cheap insurance against the commonest false alarm, a result already
  // reported under a title close enough that the check did not join them.
  const titles = (spec.tables ?? []).map((t) => t.title.toLowerCase());

  return omissions
    .filter((o) => o.what?.trim())
    .filter((o) => !titles.some((title) => title.includes(o.what.trim().toLowerCase())))
    .map((o) => ({
      code: "TBLCOV01",
      severity: "WARN" as const,
      message:
        `The protocol says it will report "${o.what}", and no table does` +
        `${o.where?.trim() ? ` (${o.where.trim()})` : ""}. ` +
        `It reads: "${o.quote.trim()}". ` +
        `${o.why_it_matters.trim()}` +
        `${o.block && o.block !== "unclear" ? ` It would belong in the ${o.block} section.` : ""}`,
    }));
}
