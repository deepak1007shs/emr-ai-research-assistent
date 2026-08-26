import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * Nothing but a check that the protocol exists.
 *
 * The shell is one level up, around the whole signed-in app. This only stops a
 * bad id rendering four empty documents, and RLS makes someone else's protocol
 * indistinguishable from a missing one.
 */
export default async function ProtocolLayout({
  children,
  params,
}: LayoutProps<"/protocols/[id]">) {
  const { id } = await params;
  const supabase = await createClient();

  const { data } = await supabase.from("protocols").select("id").eq("id", id).maybeSingle();
  if (!data) notFound();

  return <>{children}</>;
}
