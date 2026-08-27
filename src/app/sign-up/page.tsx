import { AuthForm } from "@/components/auth-form";

export const metadata = { title: "Create an account — EMR AI Research Assistant" };

export default function SignUpPage() {
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-6 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">EMR AI Research Assistant</h1>
      <p className="mt-1 mb-8 text-sm text-muted">
        Create an account to review a protocol.
      </p>
      <AuthForm mode="sign-up" />
    </main>
  );
}
