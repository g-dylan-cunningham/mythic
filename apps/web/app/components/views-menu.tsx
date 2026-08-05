"use client";

import Link from "next/link";
import { useState } from "react";

export type ViewMenuLink = {
  href: string;
  label: string;
};

export function ViewsMenu({ links }: { links: ViewMenuLink[] }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        aria-expanded={open}
        className="flex h-9 cursor-pointer items-center rounded-md border border-neutral-800 px-3 text-sm font-medium text-neutral-200 transition hover:border-neutral-600 hover:bg-neutral-900"
        onClick={() => setOpen((current) => !current)}
        type="button"
      >
        Views
      </button>
      {open ? (
        <div className="absolute right-0 mt-2 w-56 overflow-hidden rounded-lg border border-neutral-800 bg-neutral-950 shadow-xl shadow-black/40">
          {links.map((link) => (
            <Link
              className="block px-4 py-3 text-sm text-neutral-300 transition hover:bg-neutral-900 hover:text-emerald-300"
              href={link.href}
              key={link.href}
              onClick={() => setOpen(false)}
            >
              {link.label}
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}
