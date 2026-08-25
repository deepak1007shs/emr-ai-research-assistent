"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Fixes what can be fixed for nothing.
 *
 * Most findings are mechanical, so this tries them before any paid re-draft is
 * considered, and reports exactly what it changed.
 */
export function RepairSpecButton({ specId }: { specId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ applied: string[]; message: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function repair() {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const response = await fetch(`/api/specs/${specId}/repair`, { method: "POST" });
      const body = await response.json();
      if (!response.ok) {
        setError(body.error ?? "The repair was rejected.");
      } else {
        setResult(body);
        router.refresh();
      }
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={repair}
        disabled={busy}
        className="rounded-lg border border-border px-3 py-2 text-xs font-medium disabled:opacity-50"
      >
        {busy ? "Checking..." : "Fix what can be fixed for free"}
      </button>

      {result && (
        <div className="rounded-lg border border-border bg-surface px-3 py-2.5 text-xs">
          <p>{result.message}</p>
          {result.applied.length > 0 && (
            <ul className="mt-1.5 space-y-1 text-muted">
              {result.applied.map((item, i) => (
                <li key={i}>- {item}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {error && <p className="rounded-lg bg-danger-soft px-3 py-2 text-xs text-danger">{error}</p>}
    </div>
  );
}
