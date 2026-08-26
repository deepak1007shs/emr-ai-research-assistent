"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ProtocolActions } from "./protocol-actions";
import { documentKey, protocolKey } from "./selection";
import { RowDelete } from "./row-delete";
import { SelectionBar } from "./selection-bar";
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
  onNavigate,
}: {
  protocols: ProtocolRow[];
  /** Null on the upload page, where no protocol is open. */
  activeProtocolId: string | null;
  activeDoc: DocKind | null;
  /** Closes the drawer on a narrow screen. */
  onNavigate?: () => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState<Set<string>>(
    new Set(activeProtocolId ? [activeProtocolId] : []),
  );

  // Selection is a mode rather than always-on, because the rail is read far
  // more often than it is tidied, and a column of checkboxes reads as clutter.
  const [selecting, setSelecting] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());

  function pick(key: string) {
    setPicked((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function stopSelecting() {
    setSelecting(false);
    setPicked(new Set());
  }

  /** One item, through the same endpoint the bar uses. */
  async function deleteOne(body: { protocols?: string[]; documents?: { kind: DocKind; id: string }[] }) {
    const response = await fetch("/api/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result.failed?.length) {
      throw new Error(result.error ?? result.failed?.join(" ") ?? "Could not delete it.");
    }
    setPicked(new Set());
    router.refresh();
  }

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
        {protocols.length > 0 && (
          <button
            type="button"
            onClick={() => (selecting ? stopSelecting() : setSelecting(true))}
            className="text-xs text-accent underline underline-offset-2"
          >
            {selecting ? "Done" : "Select"}
          </button>
        )}
      </div>

      <Link
        href="/"
        onClick={onNavigate}
        aria-current={activeProtocolId ? undefined : "page"}
        className={`mx-3 mb-2 rounded-lg border border-dashed border-border px-3 py-2 text-xs ${
          activeProtocolId ? "text-accent" : "border-accent bg-accent-soft font-semibold"
        }`}
      >
        + New protocol
      </Link>

      <ul className="min-h-0 flex-1 overflow-y-auto pb-4">
        {!protocols.length && (
        <p className="px-3 py-2 text-xs text-muted">
          Nothing uploaded yet. The first protocol you review appears here.
        </p>
      )}
      {protocols.map((protocol) => {
          const expanded = open.has(protocol.id);
          const isActive = protocol.id === activeProtocolId;

          return (
            <li key={protocol.id}>
              <div className="flex items-center gap-1.5 pr-2">
                {selecting && (
                  <input
                    type="checkbox"
                    checked={picked.has(protocolKey(protocol.id))}
                    onChange={() => pick(protocolKey(protocol.id))}
                    aria-label={`Select ${protocol.filename}`}
                    className="ml-3 shrink-0"
                  />
                )}
                <button
                  type="button"
                  onClick={() => toggle(protocol.id)}
                  aria-expanded={expanded}
                  className={`flex min-w-0 flex-1 items-center gap-1.5 py-2 text-left text-xs hover:bg-accent-soft ${
                    selecting ? "pl-1" : "pl-3"
                  } ${isActive ? "font-semibold" : ""}`}
                >
                  <span aria-hidden className="w-3 shrink-0 text-muted">
                    {expanded ? "▾" : "▸"}
                  </span>
                  <span className="truncate">{protocol.filename}</span>
                </button>
                {selecting && (
                  <RowDelete
                    name={protocol.filename}
                    onConfirm={() => deleteOne({ protocols: [protocol.id] })}
                  />
                )}
              </div>

              {expanded && (
                <>
                  <ul className="ml-[1.375rem] border-l border-border">
                    {DOC_ORDER.map((kind) => (
                      <RailDocument
                        key={kind}
                        protocolId={protocol.id}
                        kind={kind}
                        state={protocol.documents[kind]}
                        current={isActive && kind === activeDoc}
                        onNavigate={onNavigate}
                        selecting={selecting}
                        picked={picked}
                        onPick={pick}
                        onDelete={deleteOne}
                        protocolName={protocol.filename}
                      />
                    ))}
                  </ul>
                  {!selecting && (
                    <div className="mb-2">
                      <ProtocolActions
                        protocolId={protocol.id}
                        filename={protocol.filename}
                        onDone={onNavigate}
                      />
                    </div>
                  )}
                </>
              )}
            </li>
          );
        })}
      </ul>

      {selecting && (
        <SelectionBar
          picked={picked}
          protocols={protocols}
          onDeleted={() => {
            stopSelecting();
            // The rail and the page are server-rendered, so ask for them again.
            router.push("/");
            router.refresh();
          }}
          onCancel={stopSelecting}
        />
      )}
    </nav>
  );
}

function RailDocument({
  protocolId,
  kind,
  state,
  current,
  onNavigate,
  selecting,
  picked,
  onPick,
  onDelete,
  protocolName,
}: {
  protocolId: string;
  kind: DocKind;
  state: ProtocolRow["documents"][DocKind];
  current: boolean;
  onNavigate?: () => void;
  selecting: boolean;
  picked: Set<string>;
  onPick: (key: string) => void;
  onDelete: (body: { documents: { kind: DocKind; id: string }[] }) => Promise<void>;
  protocolName: string;
}) {
  // Only a document that exists can be selected: there is nothing to delete
  // about one that was never built.
  const key = state.id ? documentKey(kind, state.id) : null;

  return (
    <li className="flex items-center gap-2 pr-2">
      {selecting && (
        <input
          type="checkbox"
          checked={key ? picked.has(key) : false}
          onChange={() => key && onPick(key)}
          disabled={!key}
          aria-label={`Select the ${DOC_SHORT[kind]}`}
          className="ml-2 shrink-0"
        />
      )}
      <Link
        href={`/protocols/${protocolId}/${kind}`}
        onClick={onNavigate}
        aria-current={current ? "page" : undefined}
        className={`flex min-w-0 flex-1 items-center gap-2 py-1.5 pl-3 text-xs hover:bg-accent-soft ${
          current ? "bg-accent-soft font-semibold" : ""
        }`}
      >
        <span className="truncate">{DOC_SHORT[kind]}</span>
        <DocumentBadge state={state} />
      </Link>
      {selecting && state.id && (
        <RowDelete
          name={`the ${DOC_SHORT[kind]} of ${protocolName}`}
          onConfirm={() => onDelete({ documents: [{ kind, id: state.id! }] })}
        />
      )}
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
