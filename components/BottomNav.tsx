"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { navigation } from "@/lib/navigation";
import NavIcon from "./NavIcon";
import { useState } from "react";
import StudioDialog from "./StudioDialog";
const menuLinks = [
  { href: "/ai", label: "AIの作業", note: "依頼・確認待ちの成果物" },
  { href: "/notes", label: "noteを書く", note: "材料・下書き・保存" },
  { href: "/sales-script", label: "営業スクリプト", note: "読む・覚える・編集する" },
  { href: "/overview", label: "全体を見る", note: "仕事と学びの状況" },
  { href: "/pdca", label: "振り返り", note: "実績を確認して次につなげる" },
  { href: "/today/planning", label: "予定を組み直す", note: "計画・持ち越し" },
  { href: "/area/sales", label: "営業代行", note: "商談の準備と実行" },
  { href: "/area/riala", label: "RIALA", note: "会員・コミュニティ運営" },
  { href: "/area/genesis", label: "GENESIS", note: "学びと練習" },
  { href: "/system", label: "接続・設定", note: "保存先と連携の状態" },
];
export default function BottomNav() {
  const path = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const primary = navigation.filter(item => ["/today", "/tasks", "/goals"].includes(item.href));
  const menuActive = !primary.some(item => path.startsWith(item.href));
  return <>
    <nav onContextMenu={e => e.preventDefault()} aria-label="メインナビゲーション" className="mobile-work-nav fixed inset-x-0 bottom-0 z-30 border-t border-hairline px-2 pb-[max(0.6rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur-xl lg:hidden">
      <div className="mx-auto flex max-w-lg">{primary.map(item => <Link key={item.href} href={item.href} aria-current={path.startsWith(item.href) ? "page" : undefined} className={"flex min-h-16 min-w-0 flex-1 flex-col items-center justify-center gap-1.5 rounded-2xl text-sm font-semibold " + (path.startsWith(item.href) ? "bg-accent-soft text-accent-dark" : "text-slate-500")}><NavIcon kind={item.kind} />{item.href === "/tasks" ? "やること" : item.label}</Link>)}
        <button type="button" aria-haspopup="dialog" aria-expanded={menuOpen} onClick={() => setMenuOpen(true)} className={"flex min-h-16 min-w-0 flex-1 flex-col items-center justify-center gap-1.5 rounded-2xl text-sm font-semibold " + (menuActive ? "bg-accent-soft text-accent-dark" : "text-slate-500")}><span className="text-xl leading-6" aria-hidden="true">☰</span>メニュー</button>
      </div>
    </nav>
    {menuOpen && <StudioDialog title="どこを開きますか？" onClose={() => setMenuOpen(false)}><nav aria-label="すべての機能" className="work-menu-links">{menuLinks.map(item => item.href === "/sales-script" ? <a key={item.href} href={item.href} onClick={() => setMenuOpen(false)}><strong>{item.label}</strong><span>{item.note}</span></a> : <Link key={item.href} href={item.href} onClick={() => setMenuOpen(false)} aria-current={path === item.href ? "page" : undefined}><strong>{item.label}</strong><span>{item.note}</span></Link>)}</nav></StudioDialog>}
  </>;
}
