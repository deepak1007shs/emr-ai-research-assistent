/*
 * Renders every document from one study spec.
 *
 *   npm run spec:render -- <spec.json> [outDir]
 *
 * The gate runs first. If it reports an ERROR, nothing is written: a document
 * built from an invalid spec is worse than no document, because it will be used.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { buildCrfDocx } from "../src/lib/render/crf.ts";
import { buildSapDocx } from "../src/lib/render/sap.ts";
import { buildShellTablesDocx } from "../src/lib/render/shell-tables.ts";
import type { StudySpec } from "../src/lib/study-spec/types.ts";

const require = createRequire(import.meta.url);
const { validate } = require("../src/lib/study-spec/validate_study_spec.js");

const [specPath, outDir = "rendered"] = process.argv.slice(2);

if (!specPath) {
  console.error("Usage: npm run spec:render -- <spec.json> [outDir]");
  process.exit(1);
}

const spec = JSON.parse(fs.readFileSync(specPath, "utf8")) as StudySpec;

const { ok, findings } = validate(spec);
for (const f of findings) {
  console.error(`${f.severity.padEnd(5)} ${f.code.padEnd(6)} ${f.path}`);
  console.error(`            ${f.message}`);
}

if (!ok) {
  console.error("\nNothing rendered. Fix the errors above and run again.");
  process.exit(1);
}

fs.mkdirSync(outDir, { recursive: true });

const documents: [string, () => Promise<Buffer>][] = [
  ["case-record-form.docx", () => buildCrfDocx(spec)],
  ["statistical-analysis-plan.docx", () => buildSapDocx(spec)],
  ["shell-tables.docx", () => buildShellTablesDocx(spec)],
];

for (const [filename, build] of documents) {
  const target = path.join(outDir, filename);
  fs.writeFileSync(target, await build());
  console.error(`Wrote ${target} (${(fs.statSync(target).size / 1024).toFixed(0)} KB)`);
}

console.error(
  `\nAll documents built from specification version ${spec.spec_version}. ` +
    `Edit the specification and rebuild; never edit these files.`,
);
