import fs from "node:fs";
import path from "node:path";

/**
 * The four prompt assets that make up the reviewer's domain knowledge.
 *
 * They stay as .md files rather than TS string literals so they can be edited
 * and diffed as prose — they will be tuned repeatedly against real protocols.
 * `next.config.ts` traces this directory into the server bundle.
 */

const KNOWLEDGE_DIR = path.join(process.cwd(), "src", "lib", "protocol", "knowledge");

const FILES = [
  "workflow.md",
  "01-study-design-classification.md",
  "02-objectives-and-outcomes.md",
  "03-detailed-methodology.md",
  "04-worked-example.md",
] as const;

let cached: string | null = null;

/**
 * Concatenated once per process. The result is byte-identical on every request,
 * which is what lets it sit behind a prompt-cache breakpoint.
 */
export function loadKnowledge(): string {
  if (cached) return cached;
  cached = FILES.map((file) =>
    fs.readFileSync(path.join(KNOWLEDGE_DIR, file), "utf8").trim(),
  ).join("\n\n---\n\n");
  return cached;
}
