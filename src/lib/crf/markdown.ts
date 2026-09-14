import { spaced } from "../render/plain.ts";
import { labelFor, responseFor } from "./response.ts";
import type { CrfForm } from "./build.ts";

/**
 * The form as markdown: the artefact the tests compare and the page shows.
 *
 * The Word file cannot be compared byte for byte - `Packer` writes a zip, and a
 * zip carries the time it was written - so this is what the acceptance test
 * holds to: build one plan's form twice and the two strings are identical.
 *
 * Every cell goes through `spaced` and never `plain`. The difference is the
 * whole layout: `plain` collapses runs of spaces, and the three spaces between
 * two ballot boxes are what stop them reading as one choice.
 */

const HEADINGS = ["S.No.", "Field / Variable", "Field type", "Response"];

/** The five types, as the form prints them. */
const PRINTED: Record<string, string> = {
  text: "Text",
  number: "Number",
  date: "Date",
  datetime: "Date and time",
  phone: "Phone number",
  single_select: "Single-select",
  multi_select: "Multi-select",
  single_select_text: "Single-select + text",
};

const cell = (value: string) => spaced(value).replace(/\|/g, "\\|");

export function renderCrfMarkdown(form: CrfForm): string {
  const lines: string[] = [];
  const say = (line = "") => lines.push(line);

  say("# CASE RECORD FORM");
  say();
  say(`*${cell(form.title)}*`);
  say();

  for (const section of form.sections) {
    say(`## Section ${section.code} - ${cell(section.title)}`);
    say();
    say(`| ${HEADINGS.join(" | ")} |`);
    say(`| ${HEADINGS.map(() => "---").join(" | ")} |`);
    for (const field of form.fields.filter((f) => f.section === section.code)) {
      say(
        `| ${field.sno} | ${cell(labelFor(field))} | ${PRINTED[field.type] ?? field.type} | ${cell(responseFor(field))} |`,
      );
    }
    say();
  }

  // Printed after the form and not inside it. The form is headings, tables and
  // answer spaces; a question for the investigator is not something the person
  // holding the pen can act on.
  if (form.todos.length) {
    say("## Open items");
    say();
    for (const todo of form.todos) say(`- ${cell(todo)}`);
    say();
  }

  return `${lines.join("\n").trimEnd()}\n`;
}
