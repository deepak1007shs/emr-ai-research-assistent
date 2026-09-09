import { describe, expect, it } from "vitest";
import { describe as describeSelection, documentKey, protocolKey, toRequest, withoutRedundant } from "./selection.ts";
import type { ProtocolRow } from "@/lib/workspace/rail.ts";

/**
 * A bulk delete is the one action where being slightly wrong is expensive, so
 * what the confirmation claims and what the request carries are both held here.
 */

const doc = (id: string | null, kind: ProtocolRow["documents"]["sap"]["kind"]) => ({
  kind,
  id,
  stale: false,
  behindAnswers: false,
  errors: 0,
  warnings: 0,
});

const protocols: ProtocolRow[] = [
  {
    id: "p1",
    filename: "first-study.docx",
    created_at: "2026-08-01T00:00:00.000Z",
    documents: {
      review: doc("r1", "review"),
      sap: doc("s1", "sap"),
      crf: doc("c1", "crf"),
    },
  },
  {
    id: "p2",
    filename: "second-study.pdf",
    created_at: "2026-08-02T00:00:00.000Z",
    documents: {
      review: doc("r2", "review"),
      sap: doc("s2", "sap"),
      crf: doc(null, "crf"),
    },
  },
];

describe("toRequest", () => {
  it("splits a mixed selection into what the endpoint expects", () => {
    const request = toRequest([protocolKey("p1"), documentKey("sap", "s2")]);
    expect(request.protocols).toEqual(["p1"]);
    expect(request.documents).toEqual([{ kind: "sap", id: "s2" }]);
  });

  it("ignores anything it cannot read", () => {
    expect(toRequest(["nonsense", "doc:sap"]).documents).toEqual([]);
  });
});

describe("withoutRedundant", () => {
  it("drops a document that its own protocol is taking anyway", () => {
    const keys = new Set([protocolKey("p1"), documentKey("sap", "s1"), documentKey("crf", "c1")]);
    const kept = withoutRedundant(keys, protocols);
    expect([...kept]).toEqual([protocolKey("p1")]);
  });

  it("keeps a document whose protocol is staying", () => {
    const keys = new Set([protocolKey("p1"), documentKey("sap", "s2")]);
    const kept = withoutRedundant(keys, protocols);
    expect(kept.has(documentKey("sap", "s2"))).toBe(true);
  });

  it("changes nothing when no protocol is selected", () => {
    const keys = new Set([documentKey("sap", "s1")]);
    expect(withoutRedundant(keys, protocols)).toBe(keys);
  });
});

describe("describe", () => {
  it("names a protocol rather than counting it", () => {
    expect(describeSelection([protocolKey("p2")], protocols)).toEqual(["second-study.pdf"]);
  });

  it("names a document by what it is and which study it belongs to", () => {
    expect(describeSelection([documentKey("crf", "c1")], protocols)).toEqual([
      "the case record form of first-study.docx",
    ]);
  });

  it("names every item, so the list can be checked", () => {
    const names = describeSelection(
      [protocolKey("p1"), documentKey("sap", "s2"), documentKey("review", "r2")],
      protocols,
    );
    expect(names).toEqual(["first-study.docx", "the analysis plan of second-study.pdf", "the review of second-study.pdf"]);
  });
});
