"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * The one server-sent-events reader.
 *
 * Every long job in this app streams the same four events over a POST, so the
 * reader lived in three near-identical copies before it lived here. It also
 * carries the thing all three copies were missing: an AbortController, so
 * navigating away mid-build stops the read instead of leaving it running
 * against an unmounted component.
 */

export type StreamUsage = { output_tokens: number };

export type StreamEvent =
  | { type: "status"; message: string }
  | { type: "usage"; usage: StreamUsage; cost: number }
  | { type: "error"; message: string }
  // Anything else is passed through to the caller, which knows its own shape:
  // `done` carries sapId or crfId or tablesId, a proposal carries a revision.
  | { type: string; [key: string]: unknown };

export type StreamState = {
  /** The current status line, or null when nothing is running. */
  status: string | null;
  /** True while a request is in flight. */
  running: boolean;
  /** Dollars spent so far, once the first usage event lands. */
  cost: number | null;
  error: string | null;
  /** POSTs the body and reads the stream. Resolves when the stream ends. */
  start: (body: unknown) => Promise<void>;
  /** Clears the error, so a failed attempt does not linger under a retry. */
  reset: () => void;
};

/** Pulls the `data:` payload out of one framed event, or null if there is none. */
function payloadOf(frame: string): string | null {
  const line = frame.split("\n").find((l) => l.startsWith("data: "));
  return line ? line.slice(6) : null;
}

export function useEventStream(
  endpoint: string,
  onEvent: (event: StreamEvent) => void,
  options: { closedMessage?: string } = {},
): StreamState {
  const [status, setStatus] = useState<string | null>(null);
  const [cost, setCost] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const abort = useRef<AbortController | null>(null);
  // Held in a ref so a caller can pass an inline function without restarting
  // anything: the stream outlives any one render.
  const handler = useRef(onEvent);
  handler.current = onEvent;

  useEffect(() => () => abort.current?.abort(), []);

  const reset = useCallback(() => setError(null), []);

  const start = useCallback(
    async (body: unknown) => {
      abort.current?.abort();
      const controller = new AbortController();
      abort.current = controller;

      setError(null);
      setCost(null);
      setStatus("Starting");

      try {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        if (!response.ok || !response.body) {
          // A failure before the stream opens arrives as plain JSON.
          const failed = await response.json().catch(() => ({}));
          setStatus(null);
          setError(failed.error ?? "The request failed.");
          return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let finished = false;

        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;

          // A chunk boundary can land anywhere, so hold the tail until a blank
          // line completes an event.
          buffer += decoder.decode(value, { stream: true });
          const frames = buffer.split("\n\n");
          buffer = frames.pop() ?? "";

          for (const frame of frames) {
            const payload = payloadOf(frame);
            if (!payload) continue;

            let event: StreamEvent;
            try {
              event = JSON.parse(payload);
            } catch {
              continue;
            }

            if (event.type === "status") {
              setStatus((event as { message: string }).message);
            } else if (event.type === "usage") {
              setCost((event as { cost: number }).cost);
            } else if (event.type === "error") {
              setStatus(null);
              setError((event as { message: string }).message);
              return;
            } else {
              // Anything else is terminal as far as this hook is concerned.
              finished = true;
              setStatus(null);
            }

            handler.current(event);
          }
        }

        if (!finished) {
          setStatus(null);
          setError(options.closedMessage ?? "The connection closed before the job finished.");
        }
      } catch (caught) {
        // An abort is the component going away, not a failure to report.
        if (controller.signal.aborted) return;
        setStatus(null);
        setError(caught instanceof Error ? caught.message : "The request failed.");
      }
    },
    [endpoint, options.closedMessage],
  );

  return { status, running: status !== null, cost, error, start, reset };
}
