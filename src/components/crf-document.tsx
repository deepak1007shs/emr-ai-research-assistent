import type { CrfForm } from "@/lib/crf/build";
import { labelFor, responseFor } from "@/lib/crf/response";

/**
 * The form on screen, as the Word file prints it.
 *
 * It computes nothing. Every label, type and answer space is read from the
 * stored form, so what is on this page and what is in the download are the same
 * document rendered twice - which is the only way they cannot drift.
 */

const PRINTED: Record<string, string> = {
  text: "Text",
  number: "Number",
  date: "Date",
  single_select: "Single-select",
  multi_select: "Multi-select",
  single_select_text: "Single-select + text",
};

export function CrfDocument({ form }: { form: CrfForm }) {
  return (
    <article className="card space-y-6 p-5">
      <header>
        <h1 className="text-lg font-semibold tracking-tight">CASE RECORD FORM</h1>
        <p className="mt-1 text-sm text-muted">{form.title}</p>
      </header>

      {form.sections.map((section) => (
        <section key={section.code} className="space-y-2">
          <h2 className="text-sm font-semibold tracking-tight">
            Section {section.code} - {section.title}
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr>
                  {["S.No.", "Field / Variable", "Field type", "Response"].map((heading) => (
                    <th
                      key={heading}
                      className="border border-line px-2 py-1.5 text-left font-semibold"
                    >
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {form.fields
                  .filter((field) => field.section === section.code)
                  .map((field) => (
                    <tr key={`${field.section}:${field.sno}`}>
                      <td className="border border-line px-2 py-1.5 align-top">{field.sno}</td>
                      <td className="border border-line px-2 py-1.5 align-top break-words">
                        {labelFor(field)}
                      </td>
                      <td className="border border-line px-2 py-1.5 align-top">
                        {PRINTED[field.type] ?? field.type}
                      </td>
                      {/* The spaces are the layout: three between two boxes is
                          what stops them reading as one choice. */}
                      <td className="border border-line px-2 py-1.5 align-top font-mono text-[0.7rem] whitespace-pre-wrap">
                        {responseFor(field)}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </article>
  );
}
