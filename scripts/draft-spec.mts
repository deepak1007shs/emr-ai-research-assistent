/*
 * Protocol in, draft study specification out.
 *
 *   npm run spec:draft -- "path/to/protocol.docx" [out.json]
 *
 * The draft is never final. It is a starting point for the investigator to read
 * and sign off, and the gate's findings are printed so nothing passes unnoticed.
 */
import fs from "node:fs";
import path from "node:path";
import { extractProtocol } from "../src/lib/protocol/extract.ts";
import { draftStudySpec } from "../src/lib/study-spec/ingest.ts";
import { costOf } from "../src/lib/protocol/pricing.ts";

const [protocolPath, outPath] = process.argv.slice(2);

if (!protocolPath) {
  console.error('Usage: npm run spec:draft -- "path/to/protocol.docx" [out.json]');
  process.exit(1);
}

const buffer = fs.readFileSync(protocolPath);
const protocol = await extractProtocol(buffer, path.basename(protocolPath));

const result = await draftStudySpec(protocol, {
  onProgress: (note) => console.error(note + "..."),
});

const target = outPath ?? "study_spec.draft.json";
fs.writeFileSync(target, JSON.stringify(result.spec, null, 2) + "\n");

const errors = result.findings.filter((f) => f.severity === "ERROR");
const warnings = result.findings.filter((f) => f.severity === "WARN");

for (const f of result.findings) {
  console.error(`${f.severity.padEnd(5)} ${f.code.padEnd(6)} ${f.path}`);
  console.error(`            ${f.message}`);
}

const cost = costOf(result.model, result.usage);
console.error(`\nWrote ${target}`);
console.error(
  `${errors.length} error(s), ${warnings.length} warning(s)${result.repaired ? ", after one repair round" : ""}.`,
);
console.error(
  `${result.usage.output_tokens.toLocaleString()} tokens written on ${result.model}, about $${cost.total.toFixed(2)}.`,
);

if (errors.length) {
  console.error("\nThe specification does not yet pass the gate. Fix the errors above, then run:");
  console.error(`  npm run spec:render -- ${target} rendered`);
  process.exit(1);
}

console.error("\nThe specification passes. Review it, then build the documents:");
console.error(`  npm run spec:render -- ${target} rendered`);
