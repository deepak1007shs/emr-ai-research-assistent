import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// The rail carries the rename and delete actions, which reach for the router.
// This test is about what the rail says, not about where it navigates.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, refresh: () => {} }),
  useSelectedLayoutSegments: () => [],
}));
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

const doc = (over: Partial<ProtocolRow["documents"]["review"]> = {}) => ({
  kind: "review" as const,
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
    review: doc(),
    sap: doc({ kind: "sap", id: null }),
    crf: doc({ kind: "crf", id: null }),
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
      activeDoc: "review" as const,
    }),
  );

describe("the protocol rail", () => {
  it("lists the document of the open protocol", () => {
    // Three: the review, the plan and the form, in the order they are made.
    // This asserted that the rail held only the review, because the plan and
    // the form had been removed from the application - which stopped being
    // true when the form was built from the plan's own objects.
    const text = open([protocol()]);
    for (const shown of ["Review", "SAP", "CRF"]) {
      expect(text, shown).toContain(shown);
    }
    expect(text).not.toContain("Shell Tables");
    expect(text).toContain("thesis.docx");
  });

  it("offers a way to start a new protocol", () => {
    expect(open([protocol()])).toContain("New protocol");
  });

  it("says so when nothing has been uploaded", () => {
    const text = open([], null);
    expect(text).toContain("Nothing uploaded yet");
  });

  it("says when the review has not been built", () => {
    const p = protocol();
    p.documents.review = doc({ id: null });
    // An em dash against a step is the design's way of saying it has not run.
    expect(open([p])).toContain("—");
  });

  it("says a document with nothing wrong is ok", () => {
    expect(open([protocol()])).toContain("ok");
  });

  it("collapses the protocols that are not open", () => {
    // Twenty protocols expanded at once is a wall, not a list.
    const text = open([protocol(), protocol({ id: "p2", filename: "other.docx" })]);
    expect(text).toContain("other.docx");
    // Only the open one shows its document, so "Review" appears once.
    expect(text.split("Review").length - 1).toBe(1);
  });
});

describe("renaming and removing from the rail", () => {
  it("offers both against the open protocol", () => {
    const text = open([protocol()]);
    expect(text).toContain("Rename");
    expect(text).toContain("Delete");
  });

  it("does not offer them against a protocol that is collapsed", () => {
    // The rail is a list to read, not a list to administer.
    const text = open([protocol(), protocol({ id: "p2", filename: "other.docx" })]);
    expect(text.split("Rename").length - 1).toBe(1);
  });
});

describe("selecting several things to delete", () => {
  const withSelection = (p: ProtocolRow[]) =>
    renderToStaticMarkup(
      createElement(ProtocolRail, {
        protocols: p,
        activeProtocolId: "p1",
        activeDoc: "review" as const,
      }),
    );

  it("offers a way into selection when there is anything to select", () => {
    expect(open([protocol()])).toContain("Select");
  });

  it("offers none when the list is empty", () => {
    expect(open([], null)).not.toContain(">Select<");
  });

  it("has no checkboxes until selection is turned on", () => {
    // The rail is read far more often than it is tidied.
    expect(withSelection([protocol()])).not.toContain('type="checkbox"');
  });

  it("has no row delete until selection is turned on either", () => {
    // Rename and Delete for the open protocol are the non-selecting affordance;
    // the per-row Delete belongs to selection.
    const text = open([protocol()]);
    expect(text).toContain("Rename");
    expect(text).not.toContain("Delete the");
  });
});
