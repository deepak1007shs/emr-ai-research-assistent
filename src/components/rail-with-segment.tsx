"use client";

import { useSelectedLayoutSegment } from "next/navigation";
import { ProtocolRail } from "./protocol-rail";
import { DOC_ORDER, type DocKind, type ProtocolRow } from "@/lib/workspace/rail";

/**
 * Tells the rail which document is open.
 *
 * The layout is a server component and cannot read the active segment, so this
 * thin client component reads it and hands it down. Keeping it separate means
 * the rail's data still comes from the server.
 */
export function RailWithSegment({
  protocols,
  activeProtocolId,
}: {
  protocols: ProtocolRow[];
  activeProtocolId: string;
}) {
  const segment = useSelectedLayoutSegment();
  const active = (DOC_ORDER as string[]).includes(segment ?? "")
    ? (segment as DocKind)
    : "review";

  return (
    <ProtocolRail
      protocols={protocols}
      activeProtocolId={activeProtocolId}
      activeDoc={active}
    />
  );
}
