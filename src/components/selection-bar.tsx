"use client";

import { useState } from "react";
import { describe as describeSelection, toRequest, withoutRedundant } from "./selection";
import type { ProtocolRow } from "@/lib/workspace/rail";

/**
 * What happens to a selection.
 *
 * The confirmation lists what is going, by name, rather than counting it. A
 * count is not something anyone can check, and checking is the whole point of
 * asking before a delete that cannot be undone.
 */
export function SelectionBar({
  picked,
  protocols,
  onDeleted,
  onCancel,
}: {
  picked: Set<string>;
  protocols: ProtocolRow[];
  onDeleted: () => void;
  onCancel: () => void;
}) {
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A document inside a protocol that is also going would be deleted twice.
  const effective = withoutRedundant(picked, protocols);
  const names = describeSelection(effective, protocols);
  const hidden = picked.size - effective.size;

  if (!picked.size) {
    return (
      <div className="border-t border-border px-3 py-2 text-xs text-muted">
        Tick a protocol, or any document inside one.
      </div>
    );
  }

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(toRequest(effective)),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(result.error ?? "Could not delete them.");
        return;
      }
      if (result.failed?.length) {
        setError(result.failed.join(" "));
        return;
      }
      onDeleted();
    } catch {
      setError("Could not delete them.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="border-t border-border bg-surface px-3 py-2.5 text-xs">
      {asking ? (
        <div role="alertdialog" aria-label="Confirm deletion">
          <p className="font-semibold">
            Delete {names.length} {names.length === 1 ? "thing" : "things"}?
          </p>
          <ul className="mt-1.5 max-h-40 space-y-0.5 overflow-y-auto">
            {names.map((name, i) => (
              <li key={i} className="truncate">
                {name}
              </li>
            ))}
          </ul>
          {hidden > 0 && (
            <p className="mt-1.5 text-muted">
              {hidden} selected {hidden === 1 ? "document goes" : "documents go"} with{" "}
              {hidden === 1 ? "its" : "their"} protocol anyway.
            </p>
          )}
          <p className="mt-1.5 text-muted">
            A protocol takes its review, plan, form and tables with it. This cannot be undone.
          </p>
          {error && <p className="mt-2 text-danger">{error}</p>}
          <div className="mt-2.5 flex gap-2">
            <button
              type="button"
              onClick={remove}
              disabled={busy}
              className="btn"
              style={{ background: "var(--danger)", color: "var(--surface)" }}
            >
              {busy ? "Deleting..." : "Delete"}
            </button>
            <button
              type="button"
              onClick={() => setAsking(false)}
              disabled={busy}
              className="btn btn-quiet"
            >
              Keep them
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-2">
          <span>
            {effective.size} selected
            {hidden > 0 && <span className="text-muted"> (+{hidden} covered)</span>}
          </span>
          <span className="flex gap-3">
            <button
              type="button"
              onClick={() => setAsking(true)}
              className="text-danger underline underline-offset-2"
            >
              Delete
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="text-accent underline underline-offset-2"
            >
              Cancel
            </button>
          </span>
        </div>
      )}
    </div>
  );
}
