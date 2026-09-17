"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { navigation } from "@/lib/navigation";
import NavIcon from "./NavIcon";
export default function BottomNav() {
  const path = usePathname();
  return <nav aria-label="メインナビゲーション" className="sticky bottom-0 z-20 border-t border-hairline bg-white/95 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur-md lg:hidden"><div className="mx-auto flex max-w-lg">{navigation.map(item => <Link key={item.href} href={item.href} aria-current={path.startsWith(item.href) ? "page" : undefined} className={"flex min-h-14 min-w-0 flex-1 flex-col items-center justify-center gap-1.5 rounded-xl text-[11px] font-medium " + (path.startsWith(item.href) ? "bg-accent-soft text-accent-dark" : "text-slate-600")}><NavIcon kind={item.kind} />{item.label}</Link>)}</div></nav>;
}
