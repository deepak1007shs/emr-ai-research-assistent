import { readFile, writeFile, mkdir } from "node:fs/promises";
import { extractProtocol } from "./src/lib/protocol/extract.ts";
import { buildSapSpec } from "./src/lib/sap/build.ts";
import { buildCrfSpec } from "./src/lib/crf/build.ts";
import { buildTablesSpec } from "./src/lib/tables/build.ts";
import { buildSapDocx } from "./src/lib/render/sap-docx.ts";
import { buildSapMarkdown } from "./src/lib/render/sap-md.ts";
import { buildCrfDocx } from "./src/lib/render/crf-docx.ts";
import { buildTablesDocx } from "./src/lib/render/tables-docx.ts";
import { tableNumbers } from "./src/lib/tables/types.ts";
import { costOf } from "./src/lib/protocol/pricing.ts";

const OUT = process.env.OUT_DIR!;
await mkdir(OUT, { recursive: true });
const file = process.env.PROTOCOL_FILE!;
const protocol = await extractProtocol(Buffer.from(await readFile(file)), file.split("/").pop()!, undefined);

console.log("== 1-3. Statistical Analysis Plan");
const sap = await buildSapSpec(protocol, { onProgress: (m) => console.log("   " + m) });
console.log(`   ${costOf(sap.model, sap.usage).total.toFixed(2)} USD, ${sap.usage.output_tokens} out`);
console.log(`   objectives=${sap.spec.objectives.length} variables=${sap.spec.variables.length} outcomes=${sap.spec.outcomes.length} analyses=${sap.spec.analyses.length}`);
for (const f of sap.findings) console.log(`   [${f.severity}] ${f.code}: ${f.message}`);
await writeFile(`${OUT}/sap.json`, JSON.stringify(sap.spec, null, 2));

console.log("\n== 4. Case Report Form");
const crf = await buildCrfSpec(protocol, sap.spec, { onProgress: (m) => console.log("   " + m) });
console.log(`   ${costOf(crf.model, crf.usage).total.toFixed(2)} USD`);
for (const f of crf.findings) console.log(`   [${f.severity}] ${f.code}: ${f.message}`);
await writeFile(`${OUT}/crf.json`, JSON.stringify(crf.spec, null, 2));

console.log("\n== 5. Shell Tables");
const tables = await buildTablesSpec(sap.spec, crf.spec, { onProgress: (m) => console.log("   " + m) });
console.log(`   ${costOf(tables.model, tables.usage).total.toFixed(2)} USD, tables=${tables.spec.tables.length}`);
for (const f of tables.findings) console.log(`   [${f.severity}] ${f.code}: ${f.message}`);

const numbers = tableNumbers(tables.spec);
await writeFile(`${OUT}/sap.docx`, await buildSapDocx(sap.spec, numbers));
await writeFile(`${OUT}/sap.md`, buildSapMarkdown(sap.spec, numbers));
await writeFile(`${OUT}/crf.docx`, await buildCrfDocx(crf.spec));
await writeFile(`${OUT}/tables.docx`, await buildTablesDocx(tables.spec));

const total = [sap, crf, tables].reduce((n, r) => n + costOf(r.model, r.usage).total, 0);
console.log(`\n== total ${total.toFixed(2)} USD`);
