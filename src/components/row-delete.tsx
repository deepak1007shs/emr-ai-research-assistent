"use client";

import { useState } from "react";

/**
 * Deleting one row, from the row.
 *
 * The bar at the foot of the rail is for a batch. This is for the far commoner
 * case of wanting one thing gone, where walking down to a bar and back is a
 * detour. It asks in place, because a rail row has no space for a dialog and
 * because the question is small: this one, yes or no.
 */
export function RowDelete({
  /** What is about to go, named, for the screen reader and the title. */
  name,
  onConfirm,
}: {
  name: string;
  onConfirm: () => Promise<void>;
}) {
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  if (asking) {
    return (
      <span className="flex shrink-0 items-center gap-1.5 text-[0.65rem]">
        <span className="text-muted">Delete?</span>
        <button
          type="button"
          onClick={async () => {
            setBusy(true);
            setError(false);
            try {
              await onConfirm();
            } catch {
              setError(true);
            } finally {
              setBusy(false);
              setAsking(false);
            }
          }}
          disabled={busy}
          className="font-semibold text-danger underline underline-offset-2"
        >
          {busy ? "..." : "Yes"}
        </button>
        <button
          type="button"
          onClick={() => setAsking(false)}
          disabled={busy}
          className="text-accent underline underline-offset-2"
        >
          No
        </button>
        {error && <span className="text-danger">failed</span>}
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setAsking(true)}
      title={`Delete ${name}`}
      aria-label={`Delete ${name}`}
      className="shrink-0 text-[0.65rem] text-danger underline underline-offset-2"
    >
      Delete
    </button>
  );
}
