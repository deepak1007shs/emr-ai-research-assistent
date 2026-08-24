import Link from "next/link";

export function SiteHeader({ email }: { email?: string | null }) {
  return (
    <header className="no-print border-b border-border">
      <div className="mx-auto flex w-full max-w-4xl items-center justify-between gap-4 px-6 py-4">
        <Link href="/" className="text-sm font-semibold tracking-tight">
          SAP Builder
        </Link>
        <div className="flex items-center gap-4">
          {email && <span className="hidden text-xs text-muted sm:inline">{email}</span>}
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
