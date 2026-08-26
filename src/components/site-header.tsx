import Link from "next/link";
import { ThemeToggle } from "./theme-toggle";

/** The header outside the workspace: the entry pages and the empty states. */
export function SiteHeader({ email }: { email?: string | null }) {
  return (
    <header className="no-print border-b border-border">
      <div className="mx-auto flex w-full max-w-2xl items-center justify-between gap-4 px-6 py-4">
        <Link href="/" className="text-sm font-semibold">
          SAP Builder
        </Link>
        <div className="flex items-center gap-3">
          {email && <span className="hidden text-xs text-muted sm:inline">{email}</span>}
          <ThemeToggle />
          <form action="/auth/sign-out" method="post">
            <button type="submit" className="text-xs text-muted underline underline-offset-2">
              Sign out
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
