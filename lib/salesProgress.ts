// 営業代行の売上の進み具合 (2026-10-10)。
//
// 本人の逆算: 報酬率20%で、10月に報酬1万円（契約5万円）、11月に報酬5万円（契約25万円）、
// 60日チャレンジとして12/8に「月10万円稼げている状態」＝直近30日（11/9〜12/8）で
// 契約50万円。これを契約金額の到達基準（期限つき）として持ち、記録した契約から
// 「いまどこか・あといくら・何件で埋まるか」を出す。
//
// 金額は本人が記録したものだけを数える。見込みや推定で埋めない。

export const COMMISSION_RATE = 0.2;

export type SaleKind = "PORTFOLIO" | "UPSELL" | "OTHER";
export const SALE_KIND_LABEL: Record<SaleKind, string> = { PORTFOLIO: "ポートフォリオ", UPSELL: "アップセル", OTHER: "その他" };

/** 価格帯（売り値）。何件で埋まるかの目安に使う。 */
export const PRICE_RANGE: Record<"PORTFOLIO" | "UPSELL", { min: number; max: number }> = {
  PORTFOLIO: { min: 4980, max: 79800 },
  UPSELL: { min: 298000, max: 798000 },
};

export interface SaleRecord {
  id: string;
  /** 契約日（YYYY-MM-DD, JST） */
  date: string;
  /** 契約金額（売り値・円） */
  amount: number;
  kind: SaleKind;
  note: string;
  recordedAt: string;
}

export interface SalesMilestone {
  id: string;
  label: string;
  /** この日以降の契約を数える */
  from: string;
  /** この日までに（含む） */
  due: string;
  /** 契約金額の目標（円） */
  target: number;
}

/** 2026-10-10 に本人とカレンダーで合わせた到達基準。 */
export const SALES_MILESTONES: SalesMilestone[] = [
  { id: "oct-w1", label: "10月 第1成約週", from: "2026-10-01", due: "2026-10-21", target: 25000 },
  { id: "oct", label: "10月の目標（報酬1万円）", from: "2026-10-01", due: "2026-10-31", target: 50000 },
  { id: "nov-h1", label: "11月 前半", from: "2026-11-01", due: "2026-11-14", target: 125000 },
  { id: "nov", label: "11月の目標（報酬5万円・タイ出発前）", from: "2026-11-01", due: "2026-11-20", target: 250000 },
  { id: "c60-1201", label: "60日チャレンジ途中（11/9〜）", from: "2026-11-09", due: "2026-12-01", target: 375000 },
  { id: "c60", label: "60日チャレンジ：月10万円（11/9〜12/8）", from: "2026-11-09", due: "2026-12-08", target: 500000 },
];

export function yen(n: number): string {
  return n >= 10000 && n % 1000 === 0 ? `${(n / 10000).toLocaleString("ja-JP", { maximumFractionDigits: 1 })}万円` : `${n.toLocaleString("ja-JP")}円`;
}

export function sumBetween(records: SaleRecord[], from: string, to: string): number {
  return records.filter(r => r.date >= from && r.date <= to).reduce((s, r) => s + r.amount, 0);
}

export interface MilestoneStatus {
  milestone: SalesMilestone;
  achieved: number;
  remaining: number;
  done: boolean;
  /** 期限まで（今日を含む）の日数。過ぎていれば負。 */
  daysLeft: number;
  /** 期限が過ぎて未達。 */
  missed: boolean;
}

function days(from: string, to: string) { return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000); }

export function milestoneStatuses(records: SaleRecord[], today: string, milestones = SALES_MILESTONES): MilestoneStatus[] {
  return milestones.map(m => {
    const achieved = sumBetween(records, m.from, m.due < today ? m.due : today);
    const remaining = Math.max(0, m.target - achieved);
    const daysLeft = days(today, m.due) + 1;
    return { milestone: m, achieved, remaining, done: remaining === 0, daysLeft, missed: remaining > 0 && m.due < today };
  });
}

/** いま追うべき到達基準: 期限が今日以降で未達のうち、いちばん早いもの。 */
export function currentMilestone(statuses: MilestoneStatus[]): MilestoneStatus | null {
  return statuses.filter(s => !s.done && s.daysLeft > 0).sort((a, b) => a.milestone.due.localeCompare(b.milestone.due))[0] ?? null;
}

export interface FillOption { label: string; count: number; total: number }

/** 残り金額を何件で埋められるかの目安（価格帯の上限・下限・平均5万円）。 */
export function fillOptions(remaining: number): FillOption[] {
  if (remaining <= 0) return [];
  const opt = (label: string, price: number): FillOption => { const count = Math.ceil(remaining / price); return { label, count, total: count * price }; };
  // ポートフォリオ1件で埋まる残りに、アップセルの例は出さない。
  const list = [...(remaining > PRICE_RANGE.PORTFOLIO.max ? [opt("アップセル（29.8万円）", PRICE_RANGE.UPSELL.min)] : []), opt("ポートフォリオ最高額（7.98万円）", PRICE_RANGE.PORTFOLIO.max), opt("ポートフォリオ平均5万円", 50000)];
  if (remaining > PRICE_RANGE.UPSELL.min && remaining <= PRICE_RANGE.UPSELL.max) list.unshift({ label: `アップセル1件（${yen(remaining)}以上の価格で）`, count: 1, total: remaining });
  return list;
}

/** 必要な商談数 = 必要件数 ÷ 成約率。成約率は実績から本人が入れる（推定しない）。 */
export function meetingsNeeded(deals: number, closeRate: number | null): number | null {
  if (closeRate === null || !(closeRate > 0) || closeRate > 1) return null;
  return Math.ceil(deals / closeRate);
}

export function reward(amount: number): number { return Math.round(amount * COMMISSION_RATE); }

export function validSaleRecord(v: unknown): v is SaleRecord {
  if (!v || typeof v !== "object") return false;
  const r = v as Record<string, unknown>;
  return typeof r.id === "string" && typeof r.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(r.date)
    && typeof r.amount === "number" && Number.isInteger(r.amount) && r.amount > 0 && r.amount <= 100_000_000
    && ["PORTFOLIO", "UPSELL", "OTHER"].includes(String(r.kind)) && typeof r.note === "string" && r.note.length <= 500 && typeof r.recordedAt === "string";
}
