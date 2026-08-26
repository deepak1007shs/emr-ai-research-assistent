"use client";

import Link from "next/link";
import { useState } from "react";
import {
  DOC_ORDER,
  DOC_SHORT,
  type DocKind,
  type ProtocolRow,
} from "@/lib/workspace/rail";

/**
 * Every protocol, expandable to its four documents.
 *
 * The rail is the map of the work: which protocols exist, how far each has got,
 * and where a document has fallen behind the plan it was built from. Only the
 * open protocol is expanded by default, because a supervisor with twenty
 * protocols wants a list, not a wall.
 */

export function ProtocolRail({
  protocols,
  activeProtocolId,
  activeDoc,
}: {
  protocols: ProtocolRow[];
  activeProtocolId: string;
  activeDoc: DocKind;
}) {
  const [open, setOpen] = useState<Set<string>>(new Set([activeProtocolId]));

  function toggle(id: string) {
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <nav aria-label="Protocols" className="flex h-full flex-col">
      <div className="flex items-baseline justify-between gap-2 px-3 py-3">
        <h2 className="text-xs font-semibold tracking-wide text-muted uppercase">Protocols</h2>
        <Link href="/" className="text-xs text-accent underline underline-offset-2">
          Upload
        </Link>
      </div>

      <ul className="min-h-0 flex-1 overflow-y-auto pb-4">
        {protocols.map((protocol) => {
          const expanded = open.has(protocol.id);
          const isActive = protocol.id === activeProtocolId;

          return (
            <li key={protocol.id}>
              <button
                type="button"
                onClick={() => toggle(protocol.id)}
                aria-expanded={expanded}
                className={`flex w-full items-center gap-1.5 px-3 py-2 text-left text-xs hover:bg-accent-soft ${
                  isActive ? "font-semibold" : ""
                }`}
              >
                <span aria-hidden className="w-3 shrink-0 text-muted">
                  {expanded ? "▾" : "▸"}
                </span>
                <span className="truncate">{protocol.filename}</span>
              </button>

              {expanded && (
                <ul className="mb-1 ml-[1.375rem] border-l border-border">
                  {DOC_ORDER.map((kind) => (
                    <RailDocument
                      key={kind}
                      protocolId={protocol.id}
                      kind={kind}
                      state={protocol.documents[kind]}
                      current={isActive && kind === activeDoc}
                    />
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function RailDocument({
  protocolId,
  kind,
  state,
  current,
}: {
  protocolId: string;
  kind: DocKind;
  state: ProtocolRow["documents"][DocKind];
  current: boolean;
}) {
  return (
    <li>
      <Link
        href={`/protocols/${protocolId}/${kind}`}
        aria-current={current ? "page" : undefined}
        className={`flex items-center gap-2 py-1.5 pr-2 pl-3 text-xs hover:bg-accent-soft ${
          current ? "bg-accent-soft font-semibold" : ""
        }`}
      >
        <span className="truncate">{DOC_SHORT[kind]}</span>
        <DocumentBadge state={state} />
      </Link>
    </li>
  );
}

function DocumentBadge({ state }: { state: ProtocolRow["documents"][DocKind] }) {
  if (!state.id) {
    return <span className="ml-auto shrink-0 text-[0.65rem] text-muted">not built</span>;
  }
  if (state.stale) {
    return (
      <span
        className="ml-auto shrink-0 rounded px-1 text-[0.65rem] text-warn"
        title="Built from an earlier analysis plan. Build it again so the three documents agree."
      >
        outdated
      </span>
    );
  }
  if (state.behindAnswers) {
    return (
      <span
        className="ml-auto shrink-0 rounded px-1 text-[0.65rem] text-warn"
        title="Built before your decisions were last edited. Build it again to use them."
      >
        older answers
      </span>
    );
  }
  if (state.errors) {
    return (
      <span
        className="ml-auto shrink-0 rounded px-1 text-[0.65rem] text-danger"
        title={`${state.errors} problem${state.errors === 1 ? "" : "s"} to look at`}
      >
        {state.errors} to fix
      </span>
    );
  }
  return (
    <span aria-hidden className="ml-auto size-1.5 shrink-0 rounded-full bg-accent" title="Ready" />
  );
}
