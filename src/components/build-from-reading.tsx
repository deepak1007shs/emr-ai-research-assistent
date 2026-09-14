"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * Builds the plan from the reading already stored, for a reading that was
 * stopped at Gate A and passes it now. No charge: the protocol is not read
 * again. See `buildableFromReading`.
 */
export function BuildFromReading({ planId }: { planId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function build() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/sap/${planId}/from-reading`, { method: "POST" });
      if (!response.ok) {
        const failed = await response.json().catch(() => ({}));
        setError(failed.error ?? "The plan could not be built.");
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="no-print space-y-2">
      <button type="button" onClick={() => void build()} disabled={busy} className="btn btn-primary">
        {busy ? "Building..." : "Build the plan from this reading"}
      </button>
      {error && <p className="pill bg-danger-soft text-danger">{error}</p>}
    </div>
  );
}
