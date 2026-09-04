"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/today", label: "TODAY", icon: "☀" },
  { href: "/tasks", label: "TASK MAP", icon: "🗂" },
  { href: "/goals", label: "GOAL TREE", icon: "🌳" },
];

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="sticky bottom-0 z-20 border-t border-black/[0.06] bg-white/90 px-3 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur-md">
      <div className="mx-auto flex max-w-sm items-stretch justify-between gap-1">
        {items.map((item) => {
          const active = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex flex-1 flex-col items-center gap-1 py-1.5"
            >
              <span
                className={`flex h-9 w-14 items-center justify-center rounded-full text-base leading-none transition-all duration-200 ${
                  active ? "bg-accent-soft" : ""
                }`}
              >
                <span
                  className={`transition-transform duration-200 ${active ? "scale-110" : "scale-100 opacity-50"}`}
                >
                  {item.icon}
                </span>
              </span>
              <span
                className={`text-[10px] font-bold tracking-wide transition-colors ${
                  active ? "text-accent-dark" : "text-stone-400"
                }`}
              >
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
