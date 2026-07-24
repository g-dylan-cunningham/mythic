import type { ReactNode } from "react";

type HoverTextProps = {
  children: ReactNode;
  className?: string;
  text: string;
};

export function HoverText({ children, className, text }: HoverTextProps) {
  return (
    <span className={className ?? ""} title={text}>
      {children}
    </span>
  );
}
