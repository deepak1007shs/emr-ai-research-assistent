"use client";

import { useState, type ReactNode } from "react";

/**
 * A delete that says what it is about to delete.
 *
 * There is no undo behind any of these, and the rows in a rail look alike, so
 * the confirmation names the thing rather than asking "are you sure?". Naming
 * it is the difference between a confirmation and a speed bump.
 */
export function ConfirmDelete({
  /** What is being removed, in the user's own words: the protocol's name. */
  name,
  /** What else goes with it, said plainly. */
  consequence,
  onConfirm,
  label = "Delete",
  children,
}: {
  name: string;
  consequence: string;
  onConfirm: () => Promise<void> | void;
  label?: string;
  /** The trigger. Defaults to a quiet Delete button. */
  children?: ReactNode;
}) {
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      await onConfirm();
      setAsking(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "That did not work.");
    } finally {
      setBusy(false);
    }
  }

  if (!asking) {
    return (
      <button
        type="button"
        onClick={() => setAsking(true)}
        className="text-xs text-danger underline underline-offset-2"
      >
        {children ?? label}
      </button>
    );
  }

  return (
    <div
      role="alertdialog"
      aria-label={`Delete ${name}`}
      className="card border-danger p-3 text-xs"
    >
      <p className="leading-relaxed">
        Delete <span className="font-semibold">{name}</span>? {consequence} This cannot be undone.
      </p>
      {error && <p className="mt-2 text-danger">{error}</p>}
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={confirm}
          disabled={busy}
          className="btn"
          style={{ background: "var(--danger)", color: "var(--surface)" }}
        >
          {busy ? "Deleting..." : label}
        </button>
        <button
          type="button"
          onClick={() => setAsking(false)}
          disabled={busy}
          className="btn btn-quiet"
        >
          Keep it
        </button>
      </div>
    </div>
  );
}
