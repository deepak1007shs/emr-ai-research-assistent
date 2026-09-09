"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ConfirmDelete } from "./confirm-delete";
import type { DocumentVersion, VersionedKind } from "@/lib/workspace/versions";

/**
 * Every build of this document, newest first.
 *
 * Each rebuild has always inserted a row and the newest has always won, so the
 * history was there and simply invisible. An old version can be downloaded, to
 * see what changed, or deleted, to stop it accumulating. Deleting the current
 * one makes the version before it current again, which is what a list like this
 * should mean by delete.
 */

const NOUN: Record<VersionedKind, string> = {
  sap: "Statistical Analysis Plan",
  crf: "Case Record Form",
  tables: "Shell Tables",
};

export function VersionList({
  kind,
  versions,
}: {
  kind: VersionedKind;
  versions: DocumentVersion[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  if (versions.length < 1) return null;

  async function remove(id: string) {
    const response = await fetch(`/api/documents/${kind}/${id}`, { method: "DELETE" });
    if (!response.ok) {
      const failed = await response.json().catch(() => ({}));
      throw new Error(failed.error ?? "Could not delete it.");
    }
    router.refresh();
  }

  return (
    <section className="no-print card p-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-baseline justify-between gap-2 text-left"
      >
        <span className="text-xs font-semibold tracking-wide text-muted uppercase">
          {versions.length} {versions.length === 1 ? "version" : "versions"}
        </span>
        <span className="text-xs text-accent underline underline-offset-2">
          {open ? "Hide" : "Manage"}
        </span>
      </button>

      {open && (
        <ul className="mt-3 divide-y divide-border">
          {versions.map((version) => (
            <li key={version.id} className="space-y-2 py-2.5">
              <div className="flex flex-wrap items-baseline justify-between gap-2 text-xs">
                <span>
                  {new Date(version.createdAt).toLocaleString()}
                  {version.current && (
                    <span className="ml-2 rounded bg-accent-soft px-1.5 py-0.5 text-[0.65rem] font-semibold">
                      current
                    </span>
                  )}
                  {version.status !== "ready" && (
                    <span className="ml-2 text-danger">{version.status}</span>
                  )}
                </span>
                <span className="flex items-center gap-3">
                  {version.errors > 0 && (
                    <span className="text-danger">
                      {version.errors} problem{version.errors === 1 ? "" : "s"}
                    </span>
                  )}
                  {version.status === "ready" && (
                    <a
                      href={`/api/${kind}/${version.id}/export`}
                      className="text-accent underline underline-offset-2"
                    >
                      Download
                    </a>
                  )}
                  <ConfirmDelete
                    name={`this version of the ${NOUN[kind]}`}
                    consequence={
                      version.current
                        ? "The version before it becomes the current one, or nothing is built if there is none."
                        : "It is a superseded version, so nothing else changes."
                    }
                    onConfirm={() => remove(version.id)}
                  />
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
