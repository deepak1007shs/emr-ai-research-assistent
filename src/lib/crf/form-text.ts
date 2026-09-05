/**
 * The wording the printed form uses, as against the wording the plan uses.
 *
 * One spec, two documents, two readers. The data-collection plan is read by a
 * supervisor deciding whether the form is complete, and it keeps everything.
 * The form is read by somebody with a pen and a patient in front of them, and
 * on that page anything addressed to the first reader is noise: it lengthens
 * the row, pushes the answer space off the line, and asks the collector to skip
 * a sentence that was never meant for them.
 */

/** A parenthesis a supervisor wrote: "(TODO: ...)" or "(NOTE: ...)". */
const SUPERVISION = /\s*\((?:TODO|NOTE)\b[^)]*\)/gi;

/**
 * The label with the supervisor's annotations taken out.
 *
 * Only a parenthesis that announces itself as one. A clinical parenthesis is
 * part of the field's name - "Oxygen saturation (SpO2)", "De Quervain (1st
 * dorsal compartment)" - and taking it away would rename the field.
 */
export function withoutSupervision(label: string): string {
  return label.replace(SUPERVISION, "").trim();
}

/** "Peritendinous fluid on HRUSG" -> the modality, where a trailing one exists. */
const TRAILING_SUBJECT = /^(.*\S)\s+on\s+([A-Za-z][A-Za-z0-9/-]*)$/;

/**
 * The label without the modality its section heading already carries.
 *
 * A diagnostic study reads the same findings twice, once per modality, so the
 * plan names every variable "... on HRUSG" or "... on MRI" to keep the two
 * apart. Printed under a heading that already says HRUSG, every row then says
 * it again, and forty rows carry a word that distinguishes nothing.
 *
 * Only where the heading genuinely carries it. Under a heading that does not,
 * the modality is the only thing telling two fields apart, and dropping it
 * would merge two questions into one.
 */
export function withoutSectionSubject(label: string, heading: string): string {
  const match = TRAILING_SUBJECT.exec(label);
  if (!match) return label;

  const [, remainder, subject] = match;
  // Two words at least. "Peritendinous fluid on HRUSG" reads perfectly well as
  // "Peritendinous fluid", and "Findings on MRI" does not read as "Findings":
  // a one-word label is too thin to give up its qualifier.
  if (remainder.trim().split(/\s+/).length < 2) return label;

  const carried = new RegExp(`\\b${subject.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
  return carried.test(heading) ? remainder.trim() : label;
}

/** The label as the form prints it: the supervisor's words out, the heading's word out. */
export function formLabel(label: string, heading: string): string {
  return withoutSectionSubject(withoutSupervision(label), heading);
}

/**
 * The note the form prints under a field, or nothing.
 *
 * A TODO is a task for whoever is correcting the protocol: add a definition,
 * decide a threshold, say how a finding will be confirmed. The collector cannot
 * act on any of it and should not have to read past it to reach the question.
 * It stays in the data-collection plan, where the person it is addressed to
 * will see it.
 *
 * A NOTE is usually a real capture rule wearing a label meant for the same
 * reader. The label comes off and the rule stays.
 */
export function formNote(note: string | undefined): string | undefined {
  const text = (note ?? "").trim();
  if (!text) return undefined;
  if (/^TODO\b/i.test(text)) return undefined;

  const stripped = text.replace(/^NOTE:\s*/i, "");
  if (stripped === text) return text;
  return stripped.charAt(0).toUpperCase() + stripped.slice(1);
}
