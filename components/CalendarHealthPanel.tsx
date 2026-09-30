"use client";

import { calendarHealth, HEALTH_KIND_LABEL, needsAction, type CalendarHealthIssue } from "@/lib/calendarHealth";
import { calendarFreshnessLabel, type CalendarFetchResult } from "@/lib/calendarProvider";

// 今週のカレンダー点検。Calendarを読むだけで、直すのは本人（書き込み権限は持たない）。
// 要対応を先に、内側に収まる重なりは「確認」として折りたたむ。

const TONE: Record<CalendarHealthIssue["kind"], string> = {
  DUPLICATE: "bg-rose-50! text-rose-800!",
  OVERLAP: "bg-amber-50! text-amber-800!",
  SHORT_REST: "bg-sky-50! text-sky-800!",
};

function Row({ issue }: { issue: CalendarHealthIssue }) {
  return <li className="border-b border-[#eeeaf3] py-4 last:border-0">
    <span className={`studio-tag ${TONE[issue.kind]}`}>{HEALTH_KIND_LABEL[issue.kind]}</span>
    <p className="mt-2 text-sm leading-7">{issue.detail}</p>
    <p className="mt-1 text-[14px] leading-6 text-[#877e94]">{issue.action}</p>
  </li>;
}

export default function CalendarHealthPanel({ calendar, today }: { calendar: CalendarFetchResult; today: string }) {
  const issues = calendarHealth({ events: calendar.events, today, coverageStart: calendar.coverageStart, coverageEnd: calendar.coverageEnd });
  const act = needsAction(issues);
  const check = issues.filter(i => i.contained);
  const unread = today > calendar.coverageEnd;
  return <section className="studio-card p-6" aria-labelledby="calendar-health-title">
    <div className="mb-2 flex items-center justify-between gap-3">
      <h2 id="calendar-health-title" className="text-base font-semibold">今週のカレンダー点検</h2>
      <span className="studio-tag">{unread ? "未確認" : act.length ? "要対応 " + act.length + "件" : "問題なし"}</span>
    </div>
    <p className="mb-3 text-[14px] leading-6 text-[#877e94]">
      二重登録・時間の重なり・夜の休息（6時間未満）を、今日〜{unread ? "" : Number(calendar.coverageEnd.slice(5, 7)) + "/" + Number(calendar.coverageEnd.slice(8, 10))}の予定から確認します。{calendarFreshnessLabel(calendar)}
    </p>
    {unread
      ? <p className="py-4 text-sm leading-7 text-[#877e94]">今日以降の予定をまだ読めていません。Calendarの接続を確認してください。</p>
      : act.length
        ? <ul>{act.map(i => <Row key={i.kind + i.date + i.eventIds.join()} issue={i} />)}</ul>
        : <p className="py-4 text-sm leading-7 text-[#877e94]">対応が必要な重なりや休息不足は見つかりませんでした。</p>}
    {check.length > 0 && <details className="studio-disclosure mt-2"><summary>内側に入っている予定 {check.length}件（意図どおりか確認）</summary><ul>{check.map(i => <Row key={i.kind + i.date + i.eventIds.join()} issue={i} />)}</ul></details>}
    <p className="mt-4 text-[14px] leading-6 text-[#877e94]">このアプリはCalendarを読むだけです。直すときはGoogle Calendarで動かし、「予定を再確認」で読み直してください。</p>
  </section>;
}
