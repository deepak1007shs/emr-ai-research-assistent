import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ProtocolRail } from "./protocol-rail.tsx";
import type { ProtocolRow } from "@/lib/workspace/rail.ts";

/**
 * The rail is the map of the work, and the only place that says a document has
 * fallen behind. What it claims has to be right.
 */

const render = (element: React.ReactElement) =>
  renderToStaticMarkup(element)
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();

const doc = (over: Partial<ProtocolRow["documents"]["sap"]> = {}) => ({
  kind: "sap" as const,
  id: "x",
  stale: false,
  behindAnswers: false,
  errors: 0,
  warnings: 0,
  ...over,
});

const protocol = (over: Partial<ProtocolRow> = {}): ProtocolRow => ({
  id: "p1",
  filename: "thesis.docx",
  created_at: "2026-08-01T00:00:00.000Z",
  documents: {
    review: { ...doc(), kind: "review" },
    sap: doc(),
    crf: { ...doc(), kind: "crf" },
    tables: { ...doc(), kind: "tables" },
  },
  ...over,
});

// Rendered by React rather than called: the rail holds which protocols are
// expanded, so it has hooks.
const open = (p: ProtocolRow[], active: string | null = "p1") =>
  render(
    createElement(ProtocolRail, {
      protocols: p,
      activeProtocolId: active,
      activeDoc: "sap" as const,
    }),
  );

describe("the protocol rail", () => {
  it("lists all four documents of the open protocol", () => {
    const text = open([protocol()]);
    for (const label of ["Review", "SAP", "CRF", "Shell Tables"]) {
      expect(text, label).toContain(label);
    }
    expect(text).toContain("thesis.docx");
  });

  it("offers a way to start a new protocol", () => {
    expect(open([protocol()])).toContain("New protocol");
  });

  it("says so when nothing has been uploaded", () => {
    const text = open([], null);
    expect(text).toContain("Nothing uploaded yet");
  });

  it("says which documents are not built", () => {
    const p = protocol();
    p.documents.crf = { ...doc({ id: null }), kind: "crf" };
    expect(open([p])).toContain("not built");
  });

  it("marks a document built from a superseded plan", () => {
    const p = protocol();
    p.documents.crf = { ...doc({ stale: true }), kind: "crf" };
    expect(open([p])).toContain("outdated");
  });

  it("marks a document built before the decisions changed", () => {
    const p = protocol();
    p.documents.tables = { ...doc({ behindAnswers: true }), kind: "tables" };
    expect(open([p])).toContain("older answers");
  });

  it("counts the problems on a document that has them", () => {
    const p = protocol();
    p.documents.sap = doc({ errors: 2 });
    expect(open([p])).toContain("2 to fix");
  });

  it("collapses the protocols that are not open", () => {
    // Twenty protocols expanded at once is a wall, not a list.
    const text = open([protocol(), protocol({ id: "p2", filename: "other.docx" })]);
    expect(text).toContain("other.docx");
    // Only the open one shows its documents, so "Shell Tables" appears once.
    expect(text.split("Shell Tables").length - 1).toBe(1);
  });
});
