import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { loadRail } from "@/lib/workspace/rail";
import { RailWithSegment } from "@/components/rail-with-segment";
import { ChatDock } from "@/components/chat-dock";
import { ThemeToggle } from "@/components/theme-toggle";

/**
 * The workspace shell.
 *
 * App Router does not re-render a layout when you move between the pages under
 * it, so the rail is queried once per protocol rather than once per document,
 * and anything running in here survives switching documents.
 */

export default async function WorkspaceLayout({
  children,
  params,
}: LayoutProps<"/protocols/[id]">) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const protocols = await loadRail(supabase);
  // RLS makes someone else's protocol indistinguishable from a missing one.
  if (!protocols.some((p) => p.id === id)) notFound();

  return (
    <div className="flex min-h-screen flex-1 flex-col">
      <header className="no-print sticky top-0 z-10 flex h-[var(--header-h)] items-center justify-between gap-4 border-b border-border bg-background px-4">
        <Link href="/" className="text-sm font-semibold">
          SAP Builder
        </Link>
        <div className="flex items-center gap-3">
          <span className="hidden text-xs text-muted sm:inline">{user.email}</span>
          <ThemeToggle />
          <form action="/auth/sign-out" method="post">
            <button type="submit" className="text-xs text-muted underline underline-offset-2">
              Sign out
            </button>
          </form>
        </div>
      </header>

      <div className="flex flex-1">
        {/*
          The rail sticks under the header and scrolls on its own, so a long
          document does not carry the list of protocols away with it.
        */}
        <aside className="no-print sticky top-[var(--header-h)] hidden h-[calc(100vh-var(--header-h))] w-64 shrink-0 overflow-y-auto border-r border-border bg-surface-sunken md:block">
          <RailWithSegment protocols={protocols} activeProtocolId={id} />
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <main className="min-w-0 flex-1">
            <div className="mx-auto w-full max-w-4xl px-6 py-8">{children}</div>
          </main>
          {/*
            In the layout, so a proposal and a running request survive moving
            between the documents of one protocol.
          */}
          <ChatDock protocolId={id} />
        </div>
      </div>
    </div>
  );
}
