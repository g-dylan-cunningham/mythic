"use client";

import { useState } from "react";
import { PendingSubmitButton } from "@/app/components/pending-submit-button";

type DecisionOption = {
  description: string;
  label: string;
  value: string;
};

type TaskDecisionModalButtonProps = {
  action: (formData: FormData) => void | Promise<void>;
  buttonClassName: string;
  buttonLabel: string;
  decisionName: string;
  jobId: string;
  modalTitle: string;
  options: DecisionOption[];
  taskId: string;
  title?: string;
};

export function TaskDecisionModalButton({
  action,
  buttonClassName,
  buttonLabel,
  decisionName,
  jobId,
  modalTitle,
  options,
  taskId,
  title,
}: TaskDecisionModalButtonProps) {
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
          aria-labelledby={`${taskId}-decision-modal-title`}
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-800/75 px-4 backdrop-blur-sm"
          role="dialog"
        >
          <div className="w-full max-w-lg rounded-lg border border-neutral-600 bg-neutral-950 p-5 shadow-[0_24px_80px_rgba(0,0,0,0.65)]">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-400">
              Decision task
            </p>
            <h2
              className="mt-2 text-lg font-semibold tracking-tight text-neutral-50"
              id={`${taskId}-decision-modal-title`}
            >
              {modalTitle}
            </h2>
            <form action={action} className="mt-4 flex flex-col gap-4">
              <input name="jobId" type="hidden" value={jobId} />
              <input name="taskId" type="hidden" value={taskId} />
              <fieldset className="flex flex-col gap-2">
                <legend className="mb-1 text-sm font-medium text-neutral-200">
                  {decisionName}
                </legend>
                {options.map((option, index) => (
                  <label
                    className="flex cursor-pointer gap-3 rounded-md border border-neutral-800 bg-neutral-900 p-3 transition hover:border-neutral-600"
                    key={option.value}
                  >
                    <input
                      className="mt-1 h-4 w-4 accent-emerald-500"
                      defaultChecked={index === 0}
                      name="outcomeKey"
                      type="radio"
                      value={option.value}
                    />
                    <span>
                      <span className="block text-sm font-medium text-neutral-100">
                        {option.label}
                      </span>
                      <span className="mt-1 block text-sm leading-5 text-neutral-400">
                        {option.description}
                      </span>
                    </span>
                  </label>
                ))}
              </fieldset>
              <textarea
                className="min-h-24 rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-neutral-400"
                name="note"
                placeholder="Optional note about this decision"
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
                  className="h-9 rounded-md border border-emerald-400/40 bg-emerald-400/10 px-3 text-sm text-emerald-100 transition hover:border-emerald-300"
                  pendingLabel="Saving"
                >
                  Save decision
                </PendingSubmitButton>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
