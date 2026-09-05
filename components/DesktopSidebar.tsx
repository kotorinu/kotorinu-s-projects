"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Desktop Navigation (2026-09-06): mobile keeps BottomNav untouched — this
// only renders at the lg breakpoint (see the `hidden lg:flex` below), as a
// left sidebar so TODAY/TASK MAP/GOAL TREE are reachable without a bottom
// bar eating into a widescreen layout.
const items = [
  { href: "/today", label: "TODAY", icon: "☀" },
  { href: "/tasks", label: "TASK MAP", icon: "🗂" },
  { href: "/goals", label: "GOAL TREE", icon: "🌳" },
];

export default function DesktopSidebar() {
  const pathname = usePathname();

  return (
    <nav className="hidden w-56 shrink-0 flex-col gap-1 border-r border-black/[0.06] px-3 pb-6 pt-8 lg:flex">
      <p className="mb-5 px-3 text-xs font-bold tracking-widest text-accent-dark">AI WORK OS</p>
      {items.map((item) => {
        const active = pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-bold transition-colors ${
              active ? "bg-accent-soft text-accent-dark" : "text-stone-500 hover:bg-stone-100"
            }`}
          >
            <span className="text-lg leading-none">{item.icon}</span>
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
