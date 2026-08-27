"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ProtocolActions } from "./protocol-actions";
import { RowDelete } from "./row-delete";
import { SelectionBar } from "./selection-bar";
import { documentKey, protocolKey } from "./selection";
import { PlusIcon } from "./icons";
import { DOC_ORDER, DOC_SHORT, type DocKind, type ProtocolRow } from "@/lib/workspace/rail";

/**
 * Every protocol, expandable to the four documents that make it up.
 *
 * The rail is the map of the work: which protocols exist, how far each has got,
 * and where a document has fallen behind the plan it was built from. Only the
 * open protocol is expanded, because a supervisor with twenty protocols wants a
 * list, not a wall.
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
  async function deleteOne(body: {
    protocols?: string[];
    documents?: { kind: DocKind; id: string }[];
  }) {
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
    <nav aria-label="Protocols" className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center justify-between px-3.5 pt-4 pb-2.5">
        <span className="eyebrow">Protocols</span>
        <span className="tnum text-xs text-ink-4">
          {protocols.length}
          {protocols.length > 0 && (
            <button
              type="button"
              onClick={() => (selecting ? stopSelecting() : setSelecting(true))}
              className="ml-2.5 text-xs text-brand hover:text-brand-ink"
            >
              {selecting ? "Done" : "Select"}
            </button>
          )}
        </span>
      </div>

      <div className="shrink-0 px-2.5 pb-2.5">
        {/* The one action that starts everything, so it carries the weight:
            solid, not outlined. */}
        <Link
          href="/"
          onClick={onNavigate}
          aria-current={activeProtocolId ? undefined : "page"}
          className="flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-brand bg-brand px-3 text-sm font-semibold text-[var(--accent-foreground)] shadow-[0_1px_2px_rgb(15_23_42_/_0.10)] transition-colors hover:border-brand-ink hover:bg-brand-ink"
        >
          <PlusIcon size={15} />
          New protocol
        </Link>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {!protocols.length && (
          <p className="px-2 py-1.5 text-xs text-ink-4">
            Nothing uploaded yet. The first protocol you review appears here.
          </p>
        )}

        {protocols.map((protocol) => {
          const expanded = open.has(protocol.id);
          const isActive = protocol.id === activeProtocolId;

          return (
            <div key={protocol.id} className="mb-0.5">
              <div className="flex items-center gap-1.5">
                {selecting && (
                  <input
                    type="checkbox"
                    checked={picked.has(protocolKey(protocol.id))}
                    onChange={() => pick(protocolKey(protocol.id))}
                    aria-label={`Select ${protocol.filename}`}
                    className="ml-1.5 shrink-0"
                  />
                )}
                <button
                  type="button"
                  onClick={() => toggle(protocol.id)}
                  aria-expanded={expanded}
                  className={`flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-1.75 text-left text-sm transition-colors ${
                    isActive
                      ? "bg-brand-50 font-semibold text-brand-ink"
                      : "font-medium text-ink-2 hover:bg-line-2"
                  }`}
                  style={{ letterSpacing: "-0.005em" }}
                  // Larger type in a fixed-width panel truncates sooner, so the
                  // whole name is a hover away.
                  title={protocol.filename}
                >
                  <span
                    aria-hidden
                    className={`size-[0.3125rem] shrink-0 rounded-full ${
                      isActive ? "bg-brand" : "bg-line-3"
                    }`}
                  />
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
                  <ul className="my-0.5 mb-2 ml-[1.125rem] flex flex-col gap-px border-l border-line pl-2.5">
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
            </div>
          );
        })}
      </div>

      {selecting && (
        <SelectionBar
          picked={picked}
          protocols={protocols}
          onDeleted={() => {
            stopSelecting();
            router.push("/");
            router.refresh();
          }}
          onCancel={stopSelecting}
        />
      )}

      <div className="flex shrink-0 items-center justify-between border-t border-line-2 px-3.5 py-2.5">
        <Link href="/" className="text-xs text-ink-3 hover:text-ink-2">
          Format guide
        </Link>
        <form action="/auth/sign-out" method="post">
          <button type="submit" className="text-xs text-ink-3 hover:text-ink-2">
            Sign out
          </button>
        </form>
      </div>
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
    <li className="flex items-center gap-1.5">
      {selecting && (
        <input
          type="checkbox"
          checked={key ? picked.has(key) : false}
          onChange={() => key && onPick(key)}
          disabled={!key}
          aria-label={`Select the ${DOC_SHORT[kind]}`}
          className="ml-1 shrink-0"
        />
      )}
      <Link
        href={`/protocols/${protocolId}/${kind}`}
        onClick={onNavigate}
        aria-current={current ? "page" : undefined}
        className={`flex min-w-0 flex-1 items-center gap-2 rounded-sm px-2 py-1.25 text-xs transition-colors ${
          current
            ? "bg-brand-50 font-semibold text-brand-ink"
            : "font-medium text-ink-3 hover:bg-line-2"
        }`}
      >
        <span className="flex-1 truncate">{DOC_SHORT[kind]}</span>
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

/** The right-hand meta on a step: a count when there is one, a word when not. */
function DocumentBadge({ state }: { state: ProtocolRow["documents"][DocKind] }) {
  const base = "tnum shrink-0 text-2xs";

  if (!state.id) return <span className={`${base} text-ink-4`}>—</span>;
  if (state.stale) {
    return (
      <span
        className={`${base} text-amber`}
        title="Built from an earlier analysis plan. Build it again so the documents agree."
      >
        outdated
      </span>
    );
  }
  if (state.behindAnswers) {
    return (
      <span
        className={`${base} text-amber`}
        title="Built before your decisions were last edited. Build it again to use them."
      >
        older
      </span>
    );
  }
  if (state.errors) {
    return (
      <span className={`${base} text-warn`} title={`${state.errors} to look at`}>
        {state.errors}
      </span>
    );
  }
  return <span className={`${base} text-ink-4`}>ok</span>;
}
