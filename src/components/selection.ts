import type { DocKind, ProtocolRow } from "@/lib/workspace/rail";

/**
 * What is ticked in the rail.
 *
 * A selection mixes two kinds of thing, so each is held as a string that says
 * which it is. Keeping them in one set is what lets a protocol and a document
 * inside a different protocol be deleted in the same action.
 */

export type SelectionKey = `protocol:${string}` | `doc:${DocKind}:${string}`;

export const protocolKey = (id: string): SelectionKey => `protocol:${id}`;
export const documentKey = (kind: DocKind, id: string): SelectionKey => `doc:${kind}:${id}`;

export type Parsed =
  | { type: "protocol"; id: string }
  | { type: "document"; kind: DocKind; id: string };

export function parse(key: string): Parsed | null {
  const [type, a, b] = key.split(":");
  if (type === "protocol" && a) return { type: "protocol", id: a };
  if (type === "doc" && a && b) return { type: "document", kind: a as DocKind, id: b };
  return null;
}

/** The request body the delete endpoint expects. */
export function toRequest(keys: Iterable<string>) {
  const protocols: string[] = [];
  const documents: { kind: DocKind; id: string }[] = [];
  for (const key of keys) {
    const item = parse(key);
    if (!item) continue;
    if (item.type === "protocol") protocols.push(item.id);
    else documents.push({ kind: item.kind, id: item.id });
  }
  return { protocols, documents };
}

/**
 * What the confirmation says is about to go.
 *
 * Named rather than counted: "3 items" is not something anyone can check, and
 * checking is the whole point of asking.
 */
export function describe(keys: Iterable<string>, protocols: ProtocolRow[]): string[] {
  const byId = new Map(protocols.map((p) => [p.id, p]));
  const names: string[] = [];

  for (const key of keys) {
    const item = parse(key);
    if (!item) continue;

    if (item.type === "protocol") {
      names.push(byId.get(item.id)?.filename ?? "a protocol");
      continue;
    }

    const owner = protocols.find((p) =>
      (Object.keys(p.documents) as DocKind[]).some((k) => p.documents[k].id === item.id),
    );
    const label =
      item.kind === "review"
        ? "the review"
        : item.kind === "sap"
          ? "the analysis plan"
          : item.kind === "crf"
            ? "the case record form"
            : "the shell tables";
    names.push(owner ? `${label} of ${owner.filename}` : label);
  }

  return names;
}

/**
 * A document ticked inside a protocol that is itself ticked is redundant: the
 * protocol takes it anyway. Dropping it keeps the confirmation honest.
 */
export function withoutRedundant(keys: Set<string>, protocols: ProtocolRow[]): Set<string> {
  const goingWholesale = new Set(
    [...keys]
      .map(parse)
      .filter((i): i is { type: "protocol"; id: string } => i?.type === "protocol")
      .map((i) => i.id),
  );
  if (!goingWholesale.size) return keys;

  const owned = new Set<string>();
  for (const protocol of protocols) {
    if (!goingWholesale.has(protocol.id)) continue;
    for (const kind of Object.keys(protocol.documents) as DocKind[]) {
      const id = protocol.documents[kind].id;
      if (id) owned.add(documentKey(kind, id));
    }
  }

  return new Set([...keys].filter((key) => !owned.has(key)));
}
