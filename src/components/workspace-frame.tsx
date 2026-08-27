"use client";

import { useState, type ReactNode } from "react";
import { useSelectedLayoutSegments } from "next/navigation";
import { ProtocolRail } from "./protocol-rail";
import { DOC_ORDER, type DocKind, type ProtocolRow } from "@/lib/workspace/rail";

/**
 * The body of the shell: the protocol sidebar and whatever the page puts beside
 * it.
 *
 * Only the URL knows which protocol and document are open, and a server
 * component cannot read it, so the frame is a client component around
 * server-rendered children. The rail's data still comes from the server; this
 * only decides what is highlighted.
 *
 * On a narrow screen the sidebar becomes a drawer rather than disappearing, so
 * a laptop in a clinic can still get at the other protocols.
 */
export function WorkspaceFrame({
  protocols,
  children,
}: {
  protocols: ProtocolRow[];
  children: ReactNode;
}) {
  const segments = useSelectedLayoutSegments();
  const [railOpen, setRailOpen] = useState(false);

  // ["protocols", "<id>", "sap"] under this layout, or [] on the upload page.
  const protocolId = segments[0] === "protocols" ? (segments[1] ?? null) : null;
  const segment = segments[2] ?? null;
  const activeDoc: DocKind | null =
    segment && (DOC_ORDER as string[]).includes(segment) ? (segment as DocKind) : null;

  const rail = (onNavigate?: () => void) => (
    <ProtocolRail
      protocols={protocols}
      activeProtocolId={protocolId}
      activeDoc={activeDoc}
      onNavigate={onNavigate}
    />
  );

  return (
    <div className="flex min-h-0 flex-1">
      <aside className="panel-type no-print hidden w-[var(--rail-w)] shrink-0 border-r border-line bg-surface md:flex md:flex-col">
        {rail()}
      </aside>

      {railOpen && (
        <div className="no-print fixed inset-0 z-30 flex md:hidden">
          <div className="panel-type flex h-full w-[calc(var(--rail-w)*1.15)] max-w-[85vw] flex-col border-r border-line bg-surface">
            {rail(() => setRailOpen(false))}
          </div>
          <button
            type="button"
            aria-label="Close the protocol list"
            onClick={() => setRailOpen(false)}
            className="flex-1 bg-ink/20"
          />
        </div>
      )}

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <button
          type="button"
          onClick={() => setRailOpen(true)}
          className="no-print shrink-0 border-b border-line bg-surface px-4 py-2 text-left text-xs text-brand md:hidden"
        >
          Protocols
        </button>
        {children}
      </div>
    </div>
  );
}
