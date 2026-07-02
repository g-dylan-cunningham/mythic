"use client";

import { type ButtonHTMLAttributes, type ReactNode } from "react";
import { useFormStatus } from "react-dom";

type PendingSubmitButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  pendingLabel?: ReactNode;
};

function Spinner() {
  return (
    <span
      aria-hidden="true"
      className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
    />
  );
}

export function PendingSubmitButton({
  children,
  className,
  disabled,
  onClick,
  pendingLabel,
  type = "submit",
  ...props
}: PendingSubmitButtonProps) {
  const { pending } = useFormStatus();

  return (
    <button
      {...props}
      className={`${className ?? ""} inline-flex items-center justify-center gap-2 disabled:cursor-not-allowed disabled:opacity-70`}
      disabled={disabled || pending}
      onClick={onClick}
      type={type}
    >
      {pending ? <Spinner /> : null}
      {pending ? pendingLabel ?? children : children}
    </button>
  );
}
