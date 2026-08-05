"use client";

import { useState } from "react";
import { PendingSubmitButton } from "@/app/components/pending-submit-button";

type TaskStatusModalButtonProps = {
  action: (formData: FormData) => void | Promise<void>;
  buttonClassName: string;
  buttonLabel: string;
  cancelLabel?: string;
  fieldName: string;
  jobId: string;
  modalTitle: string;
  placeholder: string;
  submitClassName: string;
  submitLabel?: string;
  taskId: string;
  title?: string;
};

export function TaskStatusModalButton({
  action,
  buttonClassName,
  buttonLabel,
  cancelLabel = "Cancel",
  fieldName,
  jobId,
  modalTitle,
  placeholder,
  submitClassName,
  submitLabel = "Submit",
  taskId,
  title,
}: TaskStatusModalButtonProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button
        className={buttonClassName}
        onClick={() => setIsOpen(true)}
        title={title}
        type="button"
      >
        {buttonLabel}
      </button>
      {isOpen ? (
        <div
          aria-labelledby={`${taskId}-${fieldName}-modal-title`}
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-950/80 px-4"
          role="dialog"
        >
          <div className="w-full max-w-md rounded-lg border border-neutral-700 bg-neutral-900 p-5 shadow-2xl">
            <h2
              className="text-lg font-semibold tracking-tight text-neutral-50"
              id={`${taskId}-${fieldName}-modal-title`}
            >
              {modalTitle}
            </h2>
            <form action={action} className="mt-4 flex flex-col gap-3">
              <input name="jobId" type="hidden" value={jobId} />
              <input name="taskId" type="hidden" value={taskId} />
              <textarea
                className="min-h-28 rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-neutral-400"
                name={fieldName}
                placeholder={placeholder}
              />
              <div className="flex justify-end gap-2">
                <button
                  className="h-9 rounded-md border border-neutral-700 px-3 text-sm text-neutral-200 transition hover:border-neutral-500"
                  onClick={() => setIsOpen(false)}
                  type="button"
                >
                  {cancelLabel}
                </button>
                <PendingSubmitButton
                  className={submitClassName}
                  pendingLabel="Submitting"
                >
                  {submitLabel}
                </PendingSubmitButton>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
