import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { loadRail } from "@/lib/workspace/rail";
import { WorkspaceFrame } from "@/components/workspace-frame";
import { ThemeToggle } from "@/components/theme-toggle";

/**
 * The workspace shell: protocols on the left, the document in the middle, the
 * chat along the bottom.
 *
 * It wraps everything you do while signed in, including uploading, so the four
 * documents of every protocol stay one click away and you never leave the place
 * you are working in to start the next study.
 *
 * App Router does not re-render a layout when you move between the pages under
 * it, so the rail is queried once rather than once per document, and anything
 * running in the chat survives switching documents.
 */
export default async function WorkspaceLayout({ children }: LayoutProps<"/">) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const protocols = await loadRail(supabase);

  return (
    <div className="flex min-h-screen flex-1 flex-col">
      <header className="no-print sticky top-0 z-20 flex h-[var(--header-h)] items-center justify-between gap-3 border-b border-border bg-background px-4">
        <Link href="/" className="text-sm font-semibold whitespace-nowrap">
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

      <WorkspaceFrame protocols={protocols}>{children}</WorkspaceFrame>
    </div>
  );
}
