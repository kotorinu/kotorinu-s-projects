"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { navigation } from "@/lib/navigation";
import NavIcon from "./NavIcon";
export default function BottomNav() {
  const path = usePathname();
  return <nav aria-label="メインナビゲーション" className="fixed inset-x-0 bottom-0 z-30 border-t border-hairline bg-white/95 px-2 pb-[max(0.6rem,env(safe-area-inset-bottom))] pt-2 shadow-[0_-10px_32px_#0f2d2610] backdrop-blur-xl dark:bg-[#111c1f]/95 lg:hidden"><div className="mx-auto flex max-w-lg">{navigation.map(item => <Link key={item.href} href={item.href} aria-current={path.startsWith(item.href) ? "page" : undefined} className={"flex min-h-16 min-w-0 flex-1 flex-col items-center justify-center gap-1.5 rounded-2xl text-[11px] font-bold " + (path.startsWith(item.href) ? "bg-accent-soft text-accent-dark" : "text-slate-500")}><NavIcon kind={item.kind} />{item.label}</Link>)}</div></nav>;
}
