import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/** Opens the most recent protocol, or sends you to upload the first one. */
export default async function ProtocolsIndex() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const { data: protocol } = await supabase
    .from("protocols")
    .select("id")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  redirect(protocol ? `/protocols/${protocol.id}` : "/");
}
