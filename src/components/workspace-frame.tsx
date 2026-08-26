"use client";

import { useState, type ReactNode } from "react";
import { useSelectedLayoutSegments } from "next/navigation";
import { ProtocolRail } from "./protocol-rail";
import { ChatDock } from "./chat-dock";
import { DOC_ORDER, type DocKind, type ProtocolRow } from "@/lib/workspace/rail";

/**
 * The three regions, and which protocol and document are open.
 *
 * Only the URL knows that, and a server component cannot read it, so the frame
 * is a client component around server-rendered children. The rail's data still
 * comes from the server; this only decides what is highlighted.
 *
 * On a narrow screen the rail becomes a drawer rather than disappearing, so a
 * laptop in a clinic can still get at the other protocols.
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

  return (
    <div className="flex flex-1">
      {/* The rail sticks under the header and scrolls on its own, so a long
          document does not carry the list of protocols away with it. */}
      <aside className="no-print sticky top-[var(--header-h)] hidden h-[calc(100vh-var(--header-h))] w-[var(--rail-w)] shrink-0 overflow-hidden border-r border-border bg-surface-sunken md:block">
        <ProtocolRail
          protocols={protocols}
          activeProtocolId={protocolId}
          activeDoc={activeDoc}
        />
      </aside>

      {railOpen && (
        <div className="no-print fixed inset-0 z-30 flex md:hidden">
          <div className="h-full w-[calc(var(--rail-w)*1.125)] max-w-[85vw] overflow-hidden border-r border-border bg-surface-sunken">
            <ProtocolRail
              protocols={protocols}
              activeProtocolId={protocolId}
              activeDoc={activeDoc}
              onNavigate={() => setRailOpen(false)}
            />
          </div>
          <button
            type="button"
            aria-label="Close the protocol list"
            onClick={() => setRailOpen(false)}
            className="flex-1 bg-foreground/20"
          />
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <button
          type="button"
          onClick={() => setRailOpen(true)}
          className="no-print border-b border-border px-4 py-2 text-left text-xs text-accent md:hidden"
        >
          Protocols
        </button>

        <main className="min-w-0 flex-1">
          <div className="mx-auto w-full max-w-4xl px-6 py-8">{children}</div>
        </main>

        {/* In the frame, so a proposal and a running request survive moving
            between the documents of one protocol. */}
        {protocolId && <ChatDock protocolId={protocolId} document={activeDoc} />}
      </div>
    </div>
  );
}
