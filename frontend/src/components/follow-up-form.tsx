"use client";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { PrimaryButton } from "@/components/mobile";
import { PhotoInput } from "@/components/photo";
import { answerFollowUp } from "@/lib/api";

/** Inline answer to the assistant's follow-up question (case status INFO_NEEDED). */
export function FollowUpForm({ caseId, onSent }: { caseId: string; onSent?: () => void }) {
  const [answer, setAnswer] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  return (
    <>
      <textarea
        value={answer}
        onChange={(e) => setAnswer(e.target.value)}
        rows={2}
        placeholder="e.g. Master bedroom, ceiling above the wardrobe"
        className="mt-3 w-full resize-none rounded-xl border border-zinc-300 p-3 text-sm outline-none focus:border-brand"
      />
      <div className="mt-2">
        <PhotoInput value={photo} onChange={setPhoto} />
      </div>
      <PrimaryButton
        className="mt-3"
        disabled={!answer.trim() || sending}
        onClick={async () => {
          setSending(true);
          try {
            await answerFollowUp(caseId, answer.trim(), photo);
            setAnswer("");
            setPhoto(null);
            onSent?.();
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Something went wrong. Please try again.");
          } finally {
            setSending(false);
          }
        }}
      >
        {sending ? <Loader2 className="size-4 animate-spin" /> : "Send"}
      </PrimaryButton>
    </>
  );
}
