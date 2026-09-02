/**
 * Does the API accept each output schema at all?
 *
 * "The compiled grammar is too large" is a rejection that only appears at
 * request time, and it has forced a redesign here twice. One token of output is
 * enough to find out and costs almost nothing, so run this after changing any
 * schema and before running a protocol through:
 *
 *   node --env-file-if-exists=.env.local --experimental-strip-types preflight.ts
 */
import Anthropic from "@anthropic-ai/sdk";
import { SAP_JSON_SCHEMA } from "./src/lib/sap/build.ts";
import { SAP_MAP_JSON_SCHEMA } from "./src/lib/sap/map-stage.ts";
import { SAP_RULES_JSON_SCHEMA } from "./src/lib/sap/rules-stage.ts";
import { COVERAGE_JSON_SCHEMA } from "./src/lib/sap/coverage.ts";
import { CRF_COMPLETION_SCHEMA, CRF_JSON_SCHEMA } from "./src/lib/crf/build.ts";
import { TABLES_JSON_SCHEMA } from "./src/lib/tables/build.ts";
import { TABLE_COVERAGE_JSON_SCHEMA } from "./src/lib/tables/coverage.ts";
import {
  SAP_REVISION_SCHEMA,
  CRF_REVISION_SCHEMA,
  TABLES_REVISION_SCHEMA,
} from "./src/lib/revise/schema.ts";

const client = new Anthropic();
let failed = false;

async function check(name: string, schema: unknown) {
  try {
    await client.messages.create({
      model: process.env.REVIEW_MODEL ?? "claude-sonnet-5",
      max_tokens: 1,
      output_config: { format: { type: "json_schema", schema } } as never,
      messages: [{ role: "user", content: "hi" }],
    });
    console.log(`  ok        ${name}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/grammar is too large/i.test(message)) {
      failed = true;
      console.log(`  TOO LARGE ${name}  <- split this schema`);
    } else if (/max_tokens/i.test(message)) {
      console.log(`  ok        ${name}`);
    } else {
      failed = true;
      console.log(`  ?         ${name}: ${message.slice(0, 140)}`);
    }
  }
}

for (const [name, schema] of [
  ["SAP 1 - frame and registries", SAP_JSON_SCHEMA],
  ["SAP 2 - analysis map", SAP_MAP_JSON_SCHEMA],
  ["SAP 3 - rules and assumptions", SAP_RULES_JSON_SCHEMA],
  ["SAP 4 - protocol read back", COVERAGE_JSON_SCHEMA],
  ["CRF", CRF_JSON_SCHEMA],
  ["CRF completion", CRF_COMPLETION_SCHEMA],
  ["Analysis blueprint", TABLES_JSON_SCHEMA],
  ["Blueprint protocol read back", TABLE_COVERAGE_JSON_SCHEMA],
  ["Revise SAP", SAP_REVISION_SCHEMA],
  ["Revise CRF", CRF_REVISION_SCHEMA],
  ["Revise tables", TABLES_REVISION_SCHEMA],
] as [string, unknown][]) {
  await check(name, schema);
}

process.exit(failed ? 1 : 0);
