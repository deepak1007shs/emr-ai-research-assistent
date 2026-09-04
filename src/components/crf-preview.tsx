import type { CrfField, CrfSpec } from "@/lib/crf/types";
import { labelNoteFor, responseFor } from "@/lib/crf/response";
import { line, plain } from "@/lib/render/plain";
import { DocSection, DocTable, DocumentShell, Note, Td } from "./document-shell";

/**
 * The case report form, on screen.
 *
 * Mirrors crf-docx.ts: the data collection plan first, then the form itself
 * with its boxes and ruled blanks drawn as they print. The plan comes first
 * because it is what a guide checks in thirty seconds, and the form is drawn as
 * a form because a data collector must recognise the page.
 */

const FIELD_HEADERS = ["#", "Field / Variable", "Field type", "Response"];

export function CrfPreview({ spec }: { spec: CrfSpec }) {
  // Every wording is resolved by id through the plan's registry, falling back
  // to what the form itself carries, exactly as the renderer does.
  const labelOf = (id: string, fallback = "") => spec.labels?.[id] ?? fallback ?? id;
  const nameOf = (f: CrfField) => (f.variable_id ? labelOf(f.variable_id, f.label) : f.label);

  // Read back from a row, so every list is treated as possibly absent.
  const identifiers = spec.identifiers ?? [];
  const sections = spec.sections ?? [];

  const fieldLabels = new Map<string, string>();
  const everyField = [
    ...identifiers,
    ...sections.flatMap((s) => [...s.fields, ...(s.sections ?? []).flatMap((p) => p.fields)]),
  ];
  for (const f of everyField) {
    if (f.variable_id) fieldLabels.set(f.variable_id, f.label);
  }

  return (
    // Mirrors `crf-docx.ts`: what is on screen is what the download contains,
    // and the download is the form. The collection plan is the other document,
    // downloaded beside it, because the two have different readers.
    <DocumentShell kind="Case Record Form" title={plain(spec.title)}>
      <DocSection title="Form & Subject Identifiers">
        <FieldTable fields={identifiers} nameOf={nameOf} />
      </DocSection>

      {sections.map((section) => (
        <DocSection key={section.letter} title={`Section ${section.letter} - ${section.title}`}>
          {section.fields.length > 0 && <FieldTable fields={section.fields} nameOf={nameOf} />}
          {section.note && <Note>{plain(section.note)}</Note>}

          {/* A section's parts, each its own table under its heading. */}
          {(section.sections ?? []).map((part, i) => (
            <div key={part.title} className="mt-5">
              <h4 className="text-sm font-semibold text-ink">{`${section.letter}${i + 1} - ${plain(part.title)}`}</h4>
              <div className="mt-2">
                <FieldTable fields={part.fields} nameOf={nameOf} />
              </div>
              {part.note && <Note>{plain(part.note)}</Note>}
            </div>
          ))}
        </DocSection>
      ))}

    </DocumentShell>
  );
}

function FieldTable({
  fields,
  nameOf,
}: {
  fields: CrfField[];
  nameOf: (field: CrfField) => string;
}) {
  return (
    <DocTable headers={FIELD_HEADERS}>
      {fields.map((field, i) => (
        <tr key={i}>
          <Td centre>{i + 1}</Td>
          <Td bold>
            {line(nameOf(field))}
            {field.primary_outcome && (
              <span className="font-normal text-muted"> (primary outcome)</span>
            )}
            {/* The printed form says this beside the label; the screen says it
                too, so the two forms ask the same question. */}
            {labelNoteFor(field) && (
              <span className="font-normal text-muted"> {labelNoteFor(field)}</span>
            )}
            {/* The datasheet column, matching what the blueprint calls this
                row and what the spreadsheet header will say. */}
            {field.column_name && (
              <span className="font-mono font-normal text-muted"> [{field.column_name}]</span>
            )}
            {field.note && <span className="block font-normal text-muted">{plain(field.note)}</span>}
          </Td>
          <Td>{field.type}</Td>
          {/* The answer space, drawn as it prints. */}
          <Td>
            <span className="font-mono whitespace-pre-wrap">{responseFor(field)}</span>
          </Td>
        </tr>
      ))}
    </DocTable>
  );
}

/** Exported for the header count shown beside the preview. */
export function fieldCount(spec: CrfSpec): number {
  return (
    (spec.identifiers ?? []).length +
    (spec.sections ?? []).reduce(
      (n, s) =>
        n + s.fields.length + (s.sections ?? []).reduce((m, p) => m + p.fields.length, 0),
      0,
    )
  );
}
