"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ConfirmDelete } from "./confirm-delete";
import { PencilIcon } from "./icons";

/**
 * Renaming and removing one protocol, from the rail.
 *
 * Kept behind a toggle because the rail is a list to read, not a list to
 * administer: the actions appear on the protocol you are looking at rather than
 * against every row at once.
 */
export function ProtocolActions({
  protocolId,
  filename,
  onDone,
}: {
  protocolId: string;
  filename: string;
  /** Closes the drawer on a narrow screen after a navigation. */
  onDone?: () => void;
}) {
  const router = useRouter();
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(filename);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function rename() {
    const trimmed = name.trim();
    if (!trimmed || trimmed === filename) {
      setRenaming(false);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/protocols/${protocolId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: trimmed }),
      });
      if (!response.ok) {
        const failed = await response.json().catch(() => ({}));
        setError(failed.error ?? "Could not rename it.");
        return;
      }
      setRenaming(false);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    const response = await fetch(`/api/protocols/${protocolId}`, { method: "DELETE" });
    if (!response.ok) {
      const failed = await response.json().catch(() => ({}));
      throw new Error(failed.error ?? "Could not delete it.");
    }
    onDone?.();
    // Away from a page that no longer has anything behind it.
    router.push("/");
    router.refresh();
  }

  return (
    <div className="space-y-2 px-2 pt-0.5 pb-1.5">
      {renaming ? (
        <div className="space-y-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") rename();
              if (e.key === "Escape") {
                setName(filename);
                setRenaming(false);
              }
            }}
            aria-label="Protocol name"
            autoFocus
            className="field text-xs"
          />
          {error && <p className="text-xs text-danger">{error}</p>}
          <div className="flex gap-2">
            <button type="button" onClick={rename} disabled={busy} className="btn btn-primary">
              {busy ? "Saving..." : "Save"}
            </button>
            <button
              type="button"
              onClick={() => {
                setName(filename);
                setRenaming(false);
              }}
              className="btn btn-quiet"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        /* Two real controls rather than two grey words. They were set at the
           smallest size the app has, in muted grey, with no icon and no border:
           present, and invisible enough to be reported as missing. */
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setRenaming(true)}
            className="inline-flex items-center gap-1.5 rounded-md border border-line px-2 py-1 text-xs font-medium text-ink-2 transition-colors hover:border-line-3 hover:bg-surface-2 hover:text-ink"
          >
            <PencilIcon className="size-3.5" />
            Rename
          </button>
          <ConfirmDelete
            name={filename}
            consequence="Its review, analysis plan, case report form and shell tables go with it, and so does the uploaded file."
            onConfirm={remove}
          />
        </div>
      )}
    </div>
  );
}
