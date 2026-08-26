import Anthropic from "@anthropic-ai/sdk";
import { MODEL } from "../protocol/analyze.ts";
import { explainApiError } from "../protocol/api-error.ts";
import type { TokenUsage } from "../protocol/pricing.ts";
import type { SapSpec } from "../sap/types.ts";
import type { CrfSpec } from "../crf/types.ts";
import type { ShellTablesSpec } from "../tables/types.ts";
import type { Finding } from "../sap/validate.ts";
import { validateSap } from "../sap/validate.ts";
import { validateCrf } from "../crf/validate.ts";
import { validateTables } from "../tables/validate.ts";
import {
  CRF_REVISION_SCHEMA,
  SAP_REVISION_SCHEMA,
  TABLES_REVISION_SCHEMA,
} from "./schema.ts";
import {
  applyCrfRevision,
  applySapRevision,
  applyTablesRevision,
  labelsFrom,
  type CrfRevision,
  type SapRevision,
  type TablesRevision,
} from "./apply.ts";

/**
 * Asking for a change to a document that already exists.
 *
 * The protocol is not sent. A revision is a question about this document, and
 * re-reading a fifty-page protocol to move a variable between two sections
 * would cost more than the change is worth.
 *
 * Effort is lower than a build for the same reason, and it is the effort that
 * matters: thinking tokens bill as output and dominate what a build costs. A
 * smaller schema alone would not have made this cheap.
 */

export class ReviseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReviseError";
  }
}

export const REVISE_EFFORT = (process.env.REVISE_EFFORT ?? "medium") as
  | "low"
  | "medium"
  | "high"
  | "xhigh"
  | "max";

export type RevisableKind = "sap" | "crf" | "tables";

const ROLE = `You are a senior medical research methodologist revising a document that
already exists.

You are given the document and one request. Change only what the request asks for
and what that change makes necessary, and leave everything else exactly as it is.
A revision is not a rewrite: an investigator has read this document, and anything
that moves without reason costs them their place in it.

Refer to every variable and every outcome by its id. Do not retype a label: the
wording comes from the analysis plan, and the application copies it in.

Never name a statistical test. The test is chosen from the data type and the
comparison by the application, so that the same study always yields the same plan.

If the request cannot be met by editing, because it changes what the study is
rather than how it is written down, return no edits, set needs_rebuild, and say
in one sentence what would have to be rebuilt and why.`;

const SCHEMA: Record<RevisableKind, Record<string, unknown>> = {
  sap: SAP_REVISION_SCHEMA,
  crf: CRF_REVISION_SCHEMA,
  tables: TABLES_REVISION_SCHEMA,
};

const NOUN: Record<RevisableKind, string> = {
  sap: "Statistical Analysis Plan",
  crf: "case report form",
  tables: "shell tables",
};

export type Revision<T> = {
  /** What the model says it did, in the investigator's language. */
  summary: string;
  /** True when the request needs a rebuild rather than an edit. */
  needsRebuild: boolean;
  /** The document as it would be. Null when nothing was changed. */
  spec: T | null;
  /** The entities the revision touched. */
  changed: string[];
  findings: Finding[];
  model: string;
  usage: TokenUsage;
};

export async function reviseDocument<T extends SapSpec | CrfSpec | ShellTablesSpec>(
  kind: RevisableKind,
  current: T,
  instruction: string,
  /** The plan in force. For a SAP revision this is the document itself. */
  sap: SapSpec,
  options: { onProgress?: (note: string) => void; onUsage?: (usage: TokenUsage) => void } = {},
): Promise<Revision<T>> {
  if (!process.env.ANTHROPIC_API_KEY) throw new ReviseError("ANTHROPIC_API_KEY is not set.");

  const client = new Anthropic({ timeout: 10 * 60 * 1000, maxRetries: 3 });

  const content: Anthropic.ContentBlockParam[] = [
    {
      type: "text",
      text: `The ${NOUN[kind]} as it stands:\n\n${JSON.stringify(current)}`,
    },
  ];

  // A form or a set of tables is revised against the plan it must serve, so the
  // ids it may refer to are the ids the plan declares.
  if (kind !== "sap") {
    content.push({
      type: "text",
      text: `The analysis plan it must serve. Every id you use must be one of these:

${JSON.stringify({
  variables: sap.variables,
  outcomes: sap.outcomes,
  analyses: sap.analyses,
})}`,
    });
  }

  content.push({
    type: "text",
    text: `The investigator asks for this change:

<request>
${instruction.trim()}
</request>

Return only the entities that change.`,
  });

  options.onProgress?.("Reading the document");

  const stream = client.messages.stream({
    model: MODEL,
    max_tokens: 16000,
    thinking: { type: "adaptive" },
    output_config: {
      effort: REVISE_EFFORT,
      format: { type: "json_schema", schema: SCHEMA[kind] },
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
    // Said in words. Without this the raw JSON body reaches the screen.
    const explained = explainApiError(error);
    if (explained) throw new ReviseError(explained);
    throw error;
  }
  if (message.stop_reason === "max_tokens") {
    throw new ReviseError("The revision was cut off before it finished.");
  }

  const text = message.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");

  const usage: TokenUsage = {
    input_tokens: message.usage.input_tokens,
    output_tokens: message.usage.output_tokens,
    cache_creation_input_tokens: message.usage.cache_creation_input_tokens ?? 0,
    cache_read_input_tokens: message.usage.cache_read_input_tokens ?? 0,
  };

  let raw: { summary?: string; needs_rebuild?: boolean };
  try {
    raw = JSON.parse(text);
  } catch {
    throw new ReviseError("The revision was not valid JSON.");
  }

  const summary = (raw.summary ?? "").trim();

  if (raw.needs_rebuild) {
    return {
      summary: summary || "This needs a rebuild rather than an edit.",
      needsRebuild: true,
      spec: null,
      changed: [],
      findings: [],
      model: message.model,
      usage,
    };
  }

  options.onProgress?.("Checking the change");

  const applied = apply(kind, current, raw, sap);

  return {
    summary: summary || "Changed.",
    needsRebuild: false,
    spec: applied.changed.length ? (applied.spec as T) : null,
    changed: applied.changed,
    findings: applied.findings,
    model: message.model,
    usage,
  };
}

/** Splices the edits in and re-runs the checks, which need no model call. */
function apply(
  kind: RevisableKind,
  current: SapSpec | CrfSpec | ShellTablesSpec,
  raw: unknown,
  sap: SapSpec,
): { spec: SapSpec | CrfSpec | ShellTablesSpec; changed: string[]; findings: Finding[] } {
  if (kind === "sap") {
    const { spec, changed } = applySapRevision(current as SapSpec, raw as SapRevision);
    return { spec, changed, findings: validateSap(spec).findings };
  }

  const labels = labelsFrom(sap);

  if (kind === "crf") {
    const { spec, changed } = applyCrfRevision(current as CrfSpec, raw as CrfRevision, labels);
    return { spec, changed, findings: validateCrf(spec, sap).findings };
  }

  const { spec, changed } = applyTablesRevision(
    current as ShellTablesSpec,
    raw as TablesRevision,
    labels,
  );
  return { spec, changed, findings: validateTables(spec, sap).findings };
}
