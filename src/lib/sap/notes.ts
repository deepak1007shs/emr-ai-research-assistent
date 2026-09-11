/**
 * The review's commentary, taken off the text that has to be read at a glance.
 *
 * An unanswered blocker reaches the builder and the builder is told to address
 * it. Addressing it means shaping the plan - adding the outcome the review says
 * is missing, adding the variable, marking the field whose value nobody has
 * decided. It does not mean writing the review's reasoning into an objective's
 * question, an analysis label or a table title, and one plan did exactly that:
 *
 *   P1. Does incisional negative pressure wound therapy, compared with standard
 *   dressing, reduce total postoperative drain output following modified radical
 *   mastectomy for breast cancer? NOTE: the trial's sample size of 98 patients
 *   is calculated from seroma incidence proportions in an external study, not
 *   from drain output values, so the study as sized may not be adequately
 *   powered to answer this primary question; the sample size must be
 *   recalculated using a mean-difference formula for drain output, or seroma
 *   incidence must be adopted as the formal primary outcome.
 *
 * That is a supervisor's first line of the document, and eighty words of it are
 * about the review rather than the study. The reasoning is not lost: the review
 * is its own document, it lists every blocker with the change each needs, and
 * this application sends the investigator there. The plan says what will be
 * done.
 *
 * Applied at the renderers rather than to the stored spec, so nothing is
 * deleted from what the model wrote and `MAP18` can still report that it wrote
 * it. One definition, because a note stripped from the Word file and left on
 * the screen is the drift this repository has repaired three times.
 */

/** True where the text carries the review's commentary rather than the study's. */
export function carriesNote(text: string | null | undefined): boolean {
  return NOTE.test(String(text ?? "")) || TRAILING.test(String(text ?? ""));
}

const NOTE = /\((?:NOTE|TODO)\b[^)]*\)/i;
const TRAILING = /(?:NOTE|TODO)\b\s*:/i;

export function withoutNote(text: string): string {
  return text
    .replace(/\s*\((?:NOTE|TODO)\b[^)]*\)/gi, "")
    .replace(/\s*(?:NOTE|TODO)\b\s*:[\s\S]*$/i, "")
    .replace(/[;,]\s*$/, "")
    .trim();
}
