import { redirect } from "next/navigation";

/** A protocol opens on its review, which is the document that comes first. */
export default async function ProtocolIndex({ params }: PageProps<"/protocols/[id]">) {
  const { id } = await params;
  redirect(`/protocols/${id}/review`);
}
