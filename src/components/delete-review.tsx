"use client";

import { useRouter } from "next/navigation";
import { ConfirmDelete } from "./confirm-delete";

/**
 * Removing a review, and with it the decisions written against it.
 *
 * The answers to the blockers live on the review row, so deleting one throws
 * those away too. That is worth saying out loud rather than discovering.
 */
export function DeleteReview({
  reviewId,
  filename,
  hasAnswers,
}: {
  reviewId: string;
  filename: string;
  hasAnswers: boolean;
}) {
  const router = useRouter();

  async function remove() {
    const response = await fetch(`/api/documents/review/${reviewId}`, { method: "DELETE" });
    if (!response.ok) {
      const failed = await response.json().catch(() => ({}));
      throw new Error(failed.error ?? "Could not delete it.");
    }
    router.refresh();
  }

  return (
    <div className="no-print flex justify-end">
      <ConfirmDelete
        name={`the review of ${filename}`}
        consequence={
          hasAnswers
            ? "Your decisions on its issues go with it, and documents already built are not changed."
            : "Documents already built are not changed."
        }
        onConfirm={remove}
        label="Delete the review"
      >
        Delete this review
      </ConfirmDelete>
    </div>
  );
}
