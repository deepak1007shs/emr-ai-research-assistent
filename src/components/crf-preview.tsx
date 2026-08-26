import type { CrfField, CrfSpec } from "@/lib/crf/types";
import { responseFor } from "@/lib/crf/response";
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

const TICK = "✓";
const FIELD_HEADERS = ["#", "Field / Variable", "Field type", "Response"];

export function CrfPreview({ spec }: { spec: CrfSpec }) {
  // Every wording is resolved by id through the plan's registry, falling back
  // to what the form itself carries, exactly as the renderer does.
  const labelOf = (id: string, fallback = "") => spec.labels?.[id] ?? fallback ?? id;
  const nameOf = (f: CrfField) => (f.variable_id ? labelOf(f.variable_id, f.label) : f.label);

  // Read back from a row, so every list is treated as possibly absent.
  const identifiers = spec.identifiers ?? [];
  const sections = spec.sections ?? [];
  const visits = spec.visits ?? [];

  const fieldLabels = new Map<string, string>();
  for (const f of [...identifiers, ...sections.flatMap((s) => s.fields)]) {
    if (f.variable_id) fieldLabels.set(f.variable_id, f.label);
  }

  return (
    <DocumentShell kind="Data Collection Plan & Case Report Form" title={plain(spec.title)}>
      <DocSection title="Data collection plan">
        <Note>
          Rows are data elements, columns are the visits. A tick means collect it here; an empty
          cell means do not.
        </Note>
        <p className="text-sm leading-relaxed">{plain(spec.capture_pattern)}</p>

        <DocTable headers={["DATA ELEMENT", ...visits]}>
          {(spec.data_elements ?? []).map((element, i) => (
            <tr key={i}>
              <Td>{line(element.element)}</Td>
              {visits.map((visit) => (
                <Td key={visit} centre>
                  {element.visits.includes(visit) ? TICK : ""}
                </Td>
              ))}
            </tr>
          ))}
        </DocTable>
      </DocSection>

      <DocSection title="Exposure, outcome and confounder roll-call">
        <Note>A build-time check. It stops the study&apos;s own variables going missing.</Note>
        <DocTable headers={["Role", "Variable", "Field", "Where captured"]}>
          {(spec.roll_call ?? []).map((entry, i) => {
            const captured = Boolean(entry.field_variable_id);
            return (
              <tr key={i}>
                <Td>{entry.role.replace(/_/g, " ")}</Td>
                <Td>{line(labelOf(entry.ref_id, fieldLabels.get(entry.ref_id) ?? entry.ref_id))}</Td>
                <Td>
                  {captured ? (
                    line(
                      labelOf(
                        entry.field_variable_id,
                        fieldLabels.get(entry.field_variable_id) ?? entry.field_variable_id,
                      ),
                    )
                  ) : (
                    <span className="font-semibold text-danger">NOT CAPTURED</span>
                  )}
                </Td>
                <Td>{line(entry.where)}</Td>
              </tr>
            );
          })}
        </DocTable>

        <p className="text-xs leading-relaxed">
          <span className="font-semibold">Once:</span> {plain((spec.collected_once ?? []).join("; "))}.
        </p>
        <p className="text-xs leading-relaxed">
          <span className="font-semibold">Repeatedly:</span>{" "}
          {plain((spec.collected_repeatedly ?? []).join("; "))}.
        </p>
      </DocSection>

      <DocSection title="Form & Subject Identifiers">
        <FieldTable fields={identifiers} nameOf={nameOf} />
      </DocSection>

      {sections.map((section) => (
        <DocSection key={section.letter} title={`Section ${section.letter} - ${section.title}`}>
          <FieldTable fields={section.fields} nameOf={nameOf} />
          {section.note && <Note>{plain(section.note)}</Note>}
        </DocSection>
      ))}

      {(spec.derived ?? []).length > 0 && (
        <DocSection title="Values calculated from this form, not collected on it">
          <DocTable headers={["Value", "Calculated from", "How"]}>
            {(spec.derived ?? []).map((d, i) => (
              <tr key={i}>
                <Td bold>{line(d.variable_id ? labelOf(d.variable_id, d.name) : d.name)}</Td>
                <Td>
                  {line(
                    d.from_variable_ids
                      .map((id) => labelOf(id, fieldLabels.get(id) ?? id))
                      .join("; "),
                  )}
                </Td>
                <Td>{line(d.how)}</Td>
              </tr>
            ))}
          </DocTable>
          <Note>
            Do not record these here. A computed value entered by hand cannot be audited, and the
            raw data is what lets an error be corrected later.
          </Note>
        </DocSection>
      )}
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
  return (spec.identifiers ?? []).length + (spec.sections ?? []).reduce((n, s) => n + s.fields.length, 0);
}
