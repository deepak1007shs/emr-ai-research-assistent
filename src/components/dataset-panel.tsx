"use client";

import { useRef, useState } from "react";

/**
 * Where collected data is added, and what came back.
 *
 * It sits on the review page and on the plan's page, because data arrives at
 * either point. Attached at the review it is read before a plan exists, and the
 * columns keep names of their own; attached once the plan is written, every
 * column the plan claims takes the datasheet name the plan and the form already
 * use, so the spreadsheet and the three documents agree.
 */

type Result = {
  datasetId: string;
  rows: number;
  columns: number;
  changes: number;
  findings: number;
};

export function DatasetPanel({
  protocolId,
  hasPlan,
  existing,
}: {
  protocolId: string;
  /** Whether a plan exists yet, which decides what the columns are renamed to. */
  hasPlan: boolean;
  existing?: { id: string; filename: string; rows: number | null; findings: number } | null;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [made, setMade] = useState<Result | null>(null);

  async function send(file: File) {
    setBusy(true);
    setError(null);
    setMade(null);
    try {
      const body = new FormData();
      body.append("protocolId", protocolId);
      body.append("file", file);
      const response = await fetch("/api/datasets", { method: "POST", body });
      const json = await response.json();
      if (!response.ok) setError(json.error ?? "The file could not be cleaned.");
      else setMade(json as Result);
    } catch {
      setError("The upload did not complete.");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <section className="no-print card p-5">
      <h2 className="text-base font-semibold">Collected data</h2>
      <p className="mt-1 max-w-prose text-sm text-muted">
        Add the spreadsheet the data was collected in, clean or not. The columns are renamed to
        the names the plan and the form use, the values are tidied, and you get back one workbook
        with the data, a log of every change made to it, a description of each column, and a list
        of what only you can decide. Nothing that changes a value&apos;s meaning is altered.
      </p>
      {!hasPlan && (
        <p className="mt-2 max-w-prose text-xs text-muted">
          There is no analysis plan yet, so the columns keep names of their own. Add the data
          again once the plan is built and they will take its names instead.
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <input
          ref={input}
          type="file"
          accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void send(file);
          }}
        />
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy}
          onClick={() => input.current?.click()}
        >
          {busy ? "Reading the sheet..." : "Add a data file"}
        </button>
        {existing && !made && (
          <a className="btn btn-quiet" href={`/api/datasets/${existing.id}`}>
            Download the cleaned workbook
          </a>
        )}
      </div>

      {busy && (
        <p className="mt-3 text-xs text-muted">
          Reading every column and what is in it. A large sheet takes no longer than a small one.
        </p>
      )}

      {error && <p className="mt-3 text-sm text-danger">{error}</p>}

      {made && (
        <div className="mt-4 text-sm">
          <p>
            {made.rows} rows and {made.columns} columns.{" "}
            {made.changes === 0
              ? "Nothing needed changing."
              : `${made.changes} value${made.changes === 1 ? "" : "s"} tidied, each one in the change log.`}{" "}
            {made.findings === 0
              ? "Nothing needs your decision."
              : `${made.findings} thing${made.findings === 1 ? "" : "s"} left for you to decide.`}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <a className="btn btn-primary" href={`/api/datasets/${made.datasetId}`}>
              Download the cleaned workbook
            </a>
            <a className="btn btn-quiet" href={`/api/datasets/${made.datasetId}?original=1`}>
              The file as it arrived
            </a>
          </div>
        </div>
      )}

      {existing && !made && (
        <p className="mt-3 text-xs text-muted">
          Currently attached: {existing.filename}
          {existing.rows ? `, ${existing.rows} rows` : ""}
          {existing.findings ? `, ${existing.findings} to decide` : ""}.
        </p>
      )}
    </section>
  );
}
