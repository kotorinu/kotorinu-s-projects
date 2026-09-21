/* eslint-disable @next/next/no-html-link-for-pages -- The script reader requires a full document navigation, not an RSC transition. */
import Link from "next/link";

export default function TodayShortcuts() {
  return <nav aria-label="よく使う機能" className="work-shortcuts">
    <a href="/sales-script"><span aria-hidden="true">▤</span><strong>スクリプトを読む</strong><span aria-hidden="true">→</span></a>
    <Link href="/today/planning"><span aria-hidden="true">◷</span><strong>予定を整える</strong><span aria-hidden="true">→</span></Link>
    <Link href="/ai"><span aria-hidden="true">◇</span><strong>AIの成果物を見る</strong><span aria-hidden="true">→</span></Link>
    <Link href="/notes"><span aria-hidden="true">✎</span><strong>noteを書く</strong><span aria-hidden="true">→</span></Link>
  </nav>;
}
