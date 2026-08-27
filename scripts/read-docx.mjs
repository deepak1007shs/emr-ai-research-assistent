/**
 * Prints the text of a .docx, so a reference document can be read here.
 *
 * The house formats arrive as Word files: the route map, the PEEP analysis
 * plan, the five families of results tables. Reading one is the first step of
 * matching it, and this is how.
 *
 *   node scripts/read-docx.mjs ~/Downloads/SAP.docx
 */
import mammoth from "mammoth";

const path = process.argv[2];
if (!path) {
  console.error("Usage: node scripts/read-docx.mjs <file.docx>");
  process.exit(1);
}

const { value } = await mammoth.extractRawText({ path });
console.log(value.replace(/\n{3,}/g, "\n\n").trim());
