import { deviceAuthenticated } from '../../../../../lib/server/deviceSession';
import { authenticated } from "../../../../../lib/riala-planner/security";
import { workStore, executionStore } from "../../../../../lib/work/store";
import { calendarFile } from "../../../../../lib/work/ical";
import type { TimeBlockOverride } from "../../../../../lib/types";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  if (!authenticated(request) && !deviceAuthenticated(request)) return Response.json({ error: "認証が必要です" }, { status: 401 });
  try {
    const core = workStore(), execution = executionStore(); if (!core || !execution) throw new Error();
    const [ledger, record] = await Promise.all([core.read(), execution.read()]);
    const superseded = new Set(record.snapshot?.supersededBlockIds as string[] ?? []);
    const blocks = Object.values(record.snapshot?.timeBlockOverrides ?? {}) as TimeBlockOverride[];
    const selected = blocks.filter(b => !superseded.has(b.id));
    return new Response(calendarFile(ledger.tasks, selected, new Date().toISOString()), { headers: {
      "Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": 'attachment; filename="work-os-plan.ics"', "Cache-Control": "private, no-store" } });
  } catch { return Response.json({ error: "予定を書き出せません。中央保存と予定日時を確認してください" }, { status: 503 }); }
}
