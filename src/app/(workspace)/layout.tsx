import { redirect } from "next/navigation";
import { Logo } from "@/components/logo";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { loadRail } from "@/lib/workspace/rail";
import { WorkspaceFrame } from "@/components/workspace-frame";
import { ThemeToggle } from "@/components/theme-toggle";

/**
 * The workspace shell: a global header, protocols on the left, the document in
 * the middle, and a review rail beside it.
 *
 * The page itself never scrolls. There are three independent scroll regions -
 * the protocol list, the document, and the issues - so reading a long document
 * does not carry the list of protocols away with it.
 *
 * It wraps everything you do while signed in, including uploading, so the four
 * documents of every protocol stay one click away. App Router does not
 * re-render a layout when you move between the pages under it, so the rail is
 * queried once rather than once per document, and anything running in the
 * composer survives switching documents.
 */
export default async function WorkspaceLayout({ children }: LayoutProps<"/">) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const protocols = await loadRail(supabase);

  const initials = (user.email ?? "?")
    .replace(/@.*/, "")
    .replace(/[^a-zA-Z]/g, "")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-bg">
      <header className="no-print flex h-[var(--header-h)] shrink-0 items-center gap-4 border-b border-line bg-surface px-4">
        <Link href="/" className="flex shrink-0 items-center gap-2.5">
          <Logo className="size-6 shrink-0" />
          <span className="text-base font-semibold tracking-tight text-ink">
            EMR AI Research Assistant
          </span>
        </Link>

        <span aria-hidden className="h-5 w-px shrink-0 bg-line" />

        {/* The breadcrumb is filled by the page, which is the only thing that
            knows which protocol and document are open. */}
        <div id="workspace-breadcrumb" className="min-w-0 flex-1" />

        <div className="flex shrink-0 items-center gap-2">
          <ThemeToggle />
          <div className="hidden h-[1.875rem] items-center gap-2 rounded-full border border-line bg-surface py-0 pr-2.5 pl-1 sm:flex">
            <span className="flex size-[1.375rem] items-center justify-center rounded-full bg-brand-100 text-2xs font-bold text-brand-ink">
              {initials || "?"}
            </span>
            <span className="text-xs font-medium text-ink-2">
              {(user.email ?? "").replace(/@.*/, "")}
            </span>
          </div>
          <form action="/auth/sign-out" method="post">
            <button type="submit" className="text-xs text-ink-3 hover:text-ink-2">
              Sign out
            </button>
          </form>
        </div>
      </header>

      <WorkspaceFrame protocols={protocols}>{children}</WorkspaceFrame>
    </div>
  );
}
