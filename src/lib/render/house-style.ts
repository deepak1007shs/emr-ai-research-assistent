import { BorderStyle, type IStylesOptions } from "docx";
import { plain } from "./plain.ts";

/**
 * The house style every generated .docx obeys.
 *
 * Times New Roman 12pt, black on white, no rules, no decoration. Headings are
 * distinguished by weight alone, because "12pt" is a blanket instruction and a
 * larger heading would break it.
 */

export const HOUSE_FONT = "Times New Roman";
/** docx measures size in half-points, so 12pt is 24. */
export const HOUSE_SIZE = 24;
export const BLACK = "000000";

const run = { font: HOUSE_FONT, size: HOUSE_SIZE, color: BLACK } as const;
const boldRun = { ...run, bold: true } as const;

/**
 * Every built-in style is overridden, not just the ones we use. The library
 * emits Word's defaults otherwise, which carry blue headings (1F4D78) and blue
 * hyperlinks (0563C1) into a document that is supposed to be black and white.
 */
export const HOUSE_STYLES: IStylesOptions = {
  default: {
    document: { run, paragraph: { spacing: { after: 120 } } },
    title: { run: boldRun },
    heading1: { run: boldRun },
    heading2: { run: boldRun },
    heading3: { run: boldRun },
    heading4: { run: boldRun },
    heading5: { run: boldRun },
    heading6: { run: boldRun },
    strong: { run: boldRun },
    listParagraph: { run },
    hyperlink: { run },
    footnoteText: { run },
    footnoteTextChar: { run },
    endnoteText: { run },
  },
};

/** A plain black single-line border, for table cells only. */
export const HOUSE_BORDER = {
  style: BorderStyle.SINGLE,
  size: 4,
  color: BLACK,
} as const;

/**
 * Characters that mark text as machine-written, mapped to their plain
 * equivalents. The em dash is the strongest tell; smart quotes and the ellipsis
 * character are the next.
 */
/**
 * Vocabulary that marks prose as machine-written. Fed to the model so the
 * problem is avoided at source rather than patched at render time.
 */
export const AI_VOCABULARY = [
  "delve", "leverage", "robust", "seamless", "comprehensive", "holistic",
  "testament", "tapestry", "landscape", "realm", "navigate", "underscore",
  "pivotal", "crucial", "vital", "myriad", "plethora", "paramount",
  "furthermore", "moreover", "additionally", "notably", "importantly",
  "it is important to note", "it is worth noting", "in today's world",
  "unlock", "elevate", "harness", "foster", "embark", "meticulous",
  "intricate", "nuanced", "multifaceted", "cutting-edge", "game-changer",
  "deep dive", "at the end of the day", "when it comes to",
] as const;

/**
 * Terms that contain a banned word and are correct medical or statistical
 * English.
 *
 * Several of the words above have a real clinical sense, and the list was being
 * applied to both. A form with a vitals section says "Vital signs"; a cohort
 * study says "vital status at 30 days"; a modified Poisson model reports
 * "robust variance". The application was telling the model to lay out vital
 * signs in one file and never to write "vital" in another, and its own check
 * would have failed the correct document.
 *
 * A phrase belongs here when a statistician or a clinician would write it.
 * Nothing here is a way to smuggle filler past the check: "vital" alone is
 * still filler, and still caught.
 */
export const ALLOWED_TERMS = [
  "robust variance",
  "robust standard error",
  "robust standard errors",
  "robust sandwich",
  "robust estimator",
  "robust regression",
  "vital signs",
  "vital status",
  "vital capacity",
  "comprehensive metabolic panel",
  "comprehensive geriatric assessment",
  "pivotal trial",
  "pivotal study",
  "foster care",
] as const;

/**
 * The banned words a text actually uses, correct terminology excused.
 *
 * One function, so the check the model is held to and the check the documents
 * are held to cannot drift apart. They already had: the test carried an
 * exception for "robust variance" that the instruction to the model did not.
 */
export function bannedWordsIn(text: string): string[] {
  let scrubbed = text;
  for (const term of ALLOWED_TERMS) {
    scrubbed = scrubbed.replace(new RegExp(term, "gi"), " ");
  }
  return AI_VOCABULARY.filter((word) => new RegExp(`\\b${word}\\b`, "i").test(scrubbed));
}

/**
 * Re-exported so every renderer keeps importing the house style from one
 * place. The implementation lives in plain.ts, which does not import `docx`.
 */
export { plain };
