import type { ReactNode } from "react";

/**
 * A document that does not exist yet.
 *
 * The page says what the document is for before offering to build it, because
 * the decision to spend a few minutes and a little money is easier to make
 * when you know what comes back.
 */
export function NotBuilt({
  kind,
  description,
  children,
}: {
  kind: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="card p-6">
      <h1 className="text-base font-semibold">{kind}</h1>
      <p className="mt-1.5 max-w-prose text-sm text-muted">{description}</p>
      <div className="mt-4">{children}</div>
    </section>
  );
}
