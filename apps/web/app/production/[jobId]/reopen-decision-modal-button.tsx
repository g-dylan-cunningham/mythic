"use client";

import { useState } from "react";
import { PendingSubmitButton } from "@/app/components/pending-submit-button";

type ReopenDecisionModalButtonProps = {
  action: (formData: FormData) => void | Promise<void>;
  jobId: string;
  priorOutcomeLabel: string | null;
  restoresSkippedTasks: boolean;
  taskId: string;
};

export function ReopenDecisionModalButton({
  action,
  jobId,
  priorOutcomeLabel,
  restoresSkippedTasks,
  taskId,
}: ReopenDecisionModalButtonProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button
        aria-label="Reopen decision task"
        className="h-9 w-9 rounded-md border border-neutral-700 bg-neutral-950 text-base text-neutral-200 transition hover:border-orange-300/60 hover:text-orange-100"
        onClick={() => setIsOpen(true)}
        title="Reopen decision task"
        type="button"
      >
        ↩
      </button>
      {isOpen ? (
        <div
          aria-labelledby={`${taskId}-reopen-decision-title`}
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-800/75 px-4 backdrop-blur-sm"
          role="dialog"
        >
          <div className="w-full max-w-lg rounded-lg border border-neutral-600 bg-neutral-950 p-5 shadow-[0_24px_80px_rgba(0,0,0,0.65)]">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-orange-300">
              Reopen decision
            </p>
            <h2
              className="mt-2 text-lg font-semibold tracking-tight text-neutral-50"
              id={`${taskId}-reopen-decision-title`}
            >
              Clear this artwork decision?
            </h2>
            <div className="mt-3 flex flex-col gap-3 text-sm leading-6 text-neutral-300">
              <p>
                This will reopen the decision task and clear the current decision
                {priorOutcomeLabel ? `, "${priorOutcomeLabel}"` : ""}.
              </p>
              {restoresSkippedTasks ? (
                <p className="rounded-md border border-yellow-400/30 bg-yellow-400/10 px-3 py-2 text-yellow-100">
                  Because artwork was marked as not needed, this will also reopen
                  the artwork tasks that were skipped by that decision.
                </p>
              ) : (
                <p className="rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2 text-neutral-400">
                  No skipped downstream artwork tasks are expected to be restored
                  from this decision.
                </p>
              )}
            </div>
            <form action={action} className="mt-4 flex flex-col gap-3">
              <input name="jobId" type="hidden" value={jobId} />
              <input name="taskId" type="hidden" value={taskId} />
              <textarea
                className="min-h-24 rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-neutral-400"
                name="note"
                placeholder="Optional note about why this decision is being reopened"
              />
              <div className="flex justify-end gap-2">
                <button
                  className="h-9 rounded-md border border-neutral-700 px-3 text-sm text-neutral-200 transition hover:border-neutral-500"
                  onClick={() => setIsOpen(false)}
                  type="button"
                >
                  Cancel
                </button>
                <PendingSubmitButton
                  className="h-9 rounded-md border border-orange-400/40 bg-orange-400/10 px-3 text-sm text-orange-100 transition hover:border-orange-300"
                  pendingLabel="Reopening"
                >
                  Reopen decision
                </PendingSubmitButton>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
