import assert from "node:assert/strict";
import { test } from "node:test";
import { isSalesEvent, nowAndNext } from "../lib/nowEvent";
import { makeTask } from "./helpers";
import type { CalendarEventDTO } from "../lib/calendarProvider";

const ev = (id: string, s: string, e: string, summary: string, colorId: string | null = null, description: string | null = null): CalendarEventDTO =>
  ({ id, summary, date: "2026-10-01", startTime: s, endTime: e, colorId, allDay: false, description });
const events = [
  ev("a", "07:00", "08:00", "【合宿準備】問題解決フロー", "3", "完了条件：手順が明確／資料が完成"),
  ev("b", "11:30", "12:30", "【昼｜Catch-up】"),
  ev("c", "19:00", "20:00", "【営業代行①】ヒアリングのゴール設定", "9", "完了条件：アプリに全部入っている"),
  ev("d", "20:00", "21:00", "【営業代行②】予定不調和スクリプト", "9"),
  ev("s", "01:00", "05:00", "【睡眠・回復】"),
];

test("いまの予定と次の予定を、完了条件・残り時間つきで返す（睡眠は除く）", () => {
  const r = nowAndNext(events, "2026-10-01", "19:20", [makeTask({ id: "t", title: "x", area: "営業代行", contextTags: ["calendar:c"] })]);
  assert.equal(r.current?.event.id, "c"); assert.equal(r.current?.minutesLeft, 40);
  assert.deepEqual(r.current?.criteria, ["アプリに全部入っている"]); assert.equal(r.current?.task?.id, "t");
  assert.equal(r.next?.event.id, "d"); assert.equal(r.next?.minutesUntil, 40);
  assert.deepEqual(r.ended.map(e => e.id), ["a", "b"]); assert.equal(r.total, 4);
});

test("予定の合間は current なし・next あり。全部終わったら両方なし", () => {
  const gap = nowAndNext(events, "2026-10-01", "15:00", []);
  assert.equal(gap.current, null); assert.equal(gap.next?.event.id, "c"); assert.equal(gap.next?.minutesUntil, 240);
  const done = nowAndNext(events, "2026-10-01", "23:00", []);
  assert.equal(done.current, null); assert.equal(done.next, null); assert.equal(done.ended.length, 4);
});

test("営業代行の予定を見分ける（色9・予定名）", () => {
  assert.equal(isSalesEvent(events[2]), true);
  assert.equal(isSalesEvent(ev("r", "08:00", "09:00", "ロープレ本番", "11")), true);
  assert.equal(isSalesEvent(events[0]), false);
});

test("予定の種類ごとに、その時間に開く画面を返す", async () => {
  const { eventActions } = await import("../lib/nowEvent");
  const hrefs = (summary: string, colorId: string | null = null) => eventActions(ev("x", "22:00", "22:30", summary, colorId)).map(a => a.href);
  assert.deepEqual(hrefs("【日報】1日の振り返り→明日やること（30分）"), ["/pdca"]);
  assert.deepEqual(hrefs("【週次】今週の振り返り→来週の計画をCalendarへ（1時間）")[0], "/pdca?period=week");
  assert.deepEqual(hrefs("【月次】今月の振り返り→来月の目標を再設計（3時間）")[0], "/goals");
  assert.deepEqual(hrefs("【営業代行｜夜1時間】弱点1つを直す", "9"), ["/sales-script/ttp", "/sales-script"]);
  assert.deepEqual(hrefs("【RIALA】21:30 状況確認", "10"), ["/area/riala"]);
  assert.deepEqual(hrefs("【読書｜昼30分】鬼速PDCA", "5"), []);
  assert.deepEqual(hrefs("【朝30分】ルーズリーフ読み上げ5分→スクリプト音読・暗唱", "9"), ["/declaration", "/sales-script/ttp"]);
  assert.deepEqual(hrefs("【水曜1時間】週間目標の判定→来週の進め方→野上さんへ進捗DM", "9")[0], "/sales-progress");
  assert.deepEqual(hrefs("【日曜1時間】水曜までに週間目標をやりきれるかの確認", "9")[0], "/sales-progress");
  assert.deepEqual(hrefs("【夜20分】良かった1つ・ダメだった1つ→深掘り→明日の改善", "8"), ["/pdca"]);
});

test("杉山さんTTP台本は全場面に自分のセリフがあり、できていない3つに印がある", async () => {
  const { ttpScenes, ttpPage, hearingGoal, pfWords, pastFeedback, factMap } = await import("../lib/sales-script/ttp-page");
  assert.ok(ttpPage.includes("当てはめない") && ttpPage.includes("訴求ポイントのサイン") && ttpPage.includes("ダメ元で確認してみましょうね"));
  assert.deepEqual(factMap.map(f => f.n), [1, 2, 3, 4, 5, 6, 7]);
  assert.ok(pfWords.length >= 30 && pastFeedback.length >= 10);
  assert.ok(!/(っす|んすよ|なんすか)/.test(ttpPage));
  assert.ok(hearingGoal.every(g => g.subs.length > 0 && g.subs.every(x => x.know && x.ask && x.src)));
  assert.ok(hearingGoal.some(g => g.item.includes("家族")) && hearingGoal.some(g => g.item.includes("お金")));
  assert.ok(ttpScenes[0].items.some(i => i.k === "b" && i.src === "②0:02"));
  assert.ok(ttpScenes.length >= 15);
  for (const s of ttpScenes) assert.ok(s.items.some(i => i.k === "m"), s.title);
  const weak = ttpScenes.filter(s => s.weak).map(s => s.n);
  for (const n of [2, 3, 4, 6, 8, 9, 13, 14]) assert.ok(weak.includes(n), `scene ${n}`);
  assert.ok(ttpPage.includes("今なんで取れてないのかなっていうのが、逆に疑問ですね"));
  assert.ok(!/<\/script/i.test(JSON.stringify(ttpScenes).replace(/</g, "\\u003c")));
});

test("杉山さんの商談は1本目・2本目をそれぞれ時間順で読める", async () => {
  const { video1, video2 } = await import("../lib/sales-script/ttp-videos");
  const sec = (t: string) => t.split(":").reduce((a, x) => a * 60 + Number(x), 0);
  for (const v of [video1, video2]) {
    assert.ok(v.length > 50);
    for (let i = 1; i < v.length; i++) assert.ok(sec(v[i][0]) >= sec(v[i - 1][0]), `${v[i - 1][0]} -> ${v[i][0]}`);
    assert.ok(!v.some(r => /っす|んすよ|なんすか|俺/.test(r[2])));
  }
});
