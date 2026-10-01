/**
 * Where an uploaded protocol is stored, and whether a path a browser sends is
 * one its sender may use.
 *
 * The file used to travel browser → /api/analyze → Supabase Storage. On Vercel
 * a function's request body is capped at 4.5 MB on every plan, so a 5 MB thesis
 * protocol was refused with "payload too large" before any of this code ran,
 * and nothing in the logs said why. The browser now uploads straight to the
 * bucket and the route receives only the path. The bucket's own policies
 * already confine each user to the folder named after their id; `ownsPath` is
 * the same rule checked again on the server, because the path arrives from the
 * client and the route reads the file back with it.
 *
 * Kept free of server imports so the upload form can use it too.
 */

/** The largest file the form will send. The bucket allows 25 MB. */
export const MAX_UPLOAD_BYTES = 22 * 1024 * 1024;

export function uploadPath(userId: string, uploadId: string, filename: string): string {
  // A slash in a file name would open a folder of its own.
  const name = filename.replace(/[\\/]/g, "_");
  return `${userId}/uploads/${uploadId}/${name}`;
}

export function ownsPath(userId: string, path: unknown): path is string {
  if (typeof path !== "string" || !path) return false;
  const parts = path.split("/");
  return parts[0] === userId && parts.length > 1 && !parts.includes("..") && !parts.includes("");
}
