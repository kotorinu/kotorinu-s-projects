import assert from "node:assert/strict";
import { test } from "node:test";

// Hydration-safe formatting (2026-09-09).
//
// これらの文字列は静的プリレンダリングされたページの中で描画される。ビルドは
// UTCのマシンで走り、閲覧はJSTのブラウザなので、Date のローカル時刻ゲッター
// （getHours など）を通すとサーバとクライアントで違う文字列になり、React が
// hydration mismatch (#418) を出す。実際に一度この形で出した。
//
// 対策は「ISO文字列から直接切り出す」こと。テストは TZ を変えて同じ結果に
// なることを確認する。

/** components/PlanIntegrityPanel.tsx の formatStamp と同じ実装。 */
function formatStamp(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(iso);
  if (!m) return iso;
  const [, y, mo, d, h, mi] = m;
  return `${y}/${mo}/${d} ${h}:${mi}`;
}

/** lib/buildInfo.ts の buildLabel の日時部分と同じ実装。 */
function buildWhen(iso: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(iso);
  if (!m) return null;
  const [, , mo, d, h, mi] = m;
  return `${Number(mo)}/${Number(d)} ${h}:${mi} UTC`;
}

function underTz<T>(tz: string, fn: () => T): T {
  const prev = process.env.TZ;
  process.env.TZ = tz;
  try {
    return fn();
  } finally {
    if (prev === undefined) delete process.env.TZ;
    else process.env.TZ = prev;
  }
}

const SNAPSHOT_READ_AT = "2026-09-09T00:00:00+09:00";
const BUILT_AT = "2026-09-09T08:12:34.000Z";

test("最終照合時刻は、どのタイムゾーンで描画しても同じ文字列になる", () => {
  const utc = underTz("UTC", () => formatStamp(SNAPSHOT_READ_AT));
  const jst = underTz("Asia/Tokyo", () => formatStamp(SNAPSHOT_READ_AT));
  const la = underTz("America/Los_Angeles", () => formatStamp(SNAPSHOT_READ_AT));
  assert.equal(utc, jst);
  assert.equal(utc, la);
  assert.equal(utc, "2026/09/09 00:00", "snapshot自身のオフセットどおりに読む");
});

test("build時刻も、どのタイムゾーンで描画しても同じ文字列になる", () => {
  const utc = underTz("UTC", () => buildWhen(BUILT_AT));
  const jst = underTz("Asia/Tokyo", () => buildWhen(BUILT_AT));
  assert.equal(utc, jst);
  assert.equal(utc, "9/9 08:12 UTC", "変換せず、UTCであることを明示する");
});

test("new Date().getHours() 経由だと実際にズレる（この対策が必要な理由）", () => {
  const viaDate = (iso: string) => {
    const d = new Date(iso);
    return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}`;
  };
  const utc = underTz("UTC", () => viaDate(SNAPSHOT_READ_AT));
  const jst = underTz("Asia/Tokyo", () => viaDate(SNAPSHOT_READ_AT));
  assert.notEqual(utc, jst, "ズレないなら、この回帰テストは意味を失っている");
});

test("壊れた入力でも落ちない", () => {
  assert.equal(formatStamp("not-a-date"), "not-a-date");
  assert.equal(buildWhen(""), null);
});
