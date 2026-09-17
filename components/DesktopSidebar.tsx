"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { navigation } from "@/lib/navigation";
import NavIcon from "./NavIcon";
export default function DesktopSidebar() {
  const path = usePathname();
  return <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-hairline bg-white px-4 py-8 lg:flex">
    <Link href="/today" className="mb-10 px-3 text-lg font-bold tracking-tight">work<span className="text-accent"> / </span>os</Link>
    <nav aria-label="メインナビゲーション" className="space-y-1">{navigation.map(item => <Link key={item.href} href={item.href} aria-current={path.startsWith(item.href) ? "page" : undefined} className={"flex min-h-12 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors " + (path.startsWith(item.href) ? "bg-accent-soft text-accent-dark" : "text-slate-600 hover:bg-slate-50")}><NavIcon kind={item.kind} />{item.label}</Link>)}</nav>
    <p className="mb-3 mt-9 px-3 text-xs font-medium text-slate-500">仕事と学び</p>
    <nav aria-label="領域" className="space-y-1">{[{ href: "/area/sales", label: "営業代行" }, { href: "/area/riala", label: "RIALA" }, { href: "/area/genesis", label: "GENESIS" }].map(item => <Link key={item.href} href={item.href} className="flex min-h-11 items-center rounded-lg px-3 text-sm text-slate-600 hover:bg-slate-50">{item.label}</Link>)}</nav>
    <Link href="/system" className="mt-auto rounded-lg px-3 py-3 text-xs text-slate-500 hover:bg-slate-50">接続・システム状態</Link>
  </aside>;
}
