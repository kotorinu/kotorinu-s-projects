import { Goal, MonthEndState, Outcome, RecurringRule, Task } from "./types";

// Phase 1 fixture cleanup (2026-09-05): only data the user has explicitly
// confirmed as real is kept — currently GENESIS's Outcome and RecurringRules
// below. Everything else starts empty on purpose. Do not re-add invented
// tasks, goals, or monthly outcomes here; when real data for an area is
// provided, add it — never fabricate placeholders in its place.

export const goals: Goal[] = [];

export const tasks: Task[] = [];

export const monthEndStates: MonthEndState[] = [];

export const outcomes: Outcome[] = [
  {
    id: "o-genesis-60day",
    area: "GENESIS",
    title: "60日チャレンジ",
    desiredState:
      "感情で「大丈夫」と判断するのではなく、目的から逆算して必要な行動・期限・予定時間を決め、決めた時間と期限を厳守して実行できる状態になる。さらに、出来事を具体だけで捉えず、具体→抽象→別の具体へ展開し、再現性のある考え方として使える状態になる。",
    why: "時間や期限を感覚で扱わない自分になるため。「なんとかなる」で予定を組まず、事実と逆算で管理するため。タスク量・期限・実行時間を正しく見積もれるようになるため。問題発生時に感情ではなく構造から原因を考えるため。個別の出来事から学びを抽象化し、別の場面でも使えるようにするため。",
    achievementCriteria: [
      "毎日の全量タスクを確認し、必要なタスクに期限が設定されている",
      "期限から逆算して「その日にどこまで終わっている必要があるか」が決められている",
      "実行タスクがGoogle Calendar等の予定に入っている",
      "予定時間と完了予定日を基準に実行している",
      "予定時間を超過した場合、超過原因が記録されている",
      "期限に間に合わない場合、原因と再計画が記録されている",
      "原因分析時に、手段そのものを目的化せず、「何のためにやっているか」から再整理している",
      "具体⇄抽象トレーニングを毎日30分以上実施している",
      "毎日2本、出来事→目的→理想→事実→問題→原因→Actionの形でアウトプットしている",
    ],
    status: "ACTIVE",
  },
];

export const recurringRules: RecurringRule[] = [
  {
    id: "r-001",
    title: "具体⇄抽象トレーニング 30分以上",
    frequency: "DAILY",
    area: "GENESIS",
    estimateMinutes: 30,
    aiCapability: "HYBRID",
    description: "出来事・課題・行動について、具体→抽象→別の具体へ展開し、個別事象だけで終わらない考え方を身につける。",
    definitionOfDone: [
      "合計30分以上実施している",
      "具体→抽象を最低1回行っている",
      "抽象→別の具体例への展開を最低1回行っている",
      "自分の言葉で説明できる状態になっている",
    ],
    allowedMedium: ["紙", "音声", "ChatGPT等AIとの壁打ち", "テキスト", "その他"],
    why: "個別事象だけで判断せず、構造を捉え、別の問題にも応用できる思考を身につけるため。",
    outcomeId: "o-genesis-60day",
    streakDays: 2,
  },
  {
    id: "r-002",
    title: "問題解決アウトプット2本",
    frequency: "DAILY",
    area: "GENESIS",
    estimateMinutes: null,
    aiCapability: "HYBRID",
    description:
      "その日に起きた出来事や考えたいテーマを、感情や自己解釈だけで終わらせず、出来事→目的→理想→事実→問題→原因→Actionの構造に沿って2本アウトプットする。",
    definitionOfDone: [
      "2テーマについて、出来事・目的・理想・事実・問題・原因・Actionがそれぞれ埋まっている",
    ],
    allowedMedium: ["紙", "言葉", "ChatGPT等AIとの壁打ち", "テキスト", "その他"],
    why: "推測や感情を事実化せず、目的と事実から問題を定義し、再現性のある改善Actionを作れるようにするため。",
    outcomeId: "o-genesis-60day",
    streakDays: 5,
  },
  {
    id: "r-003",
    title: "全量タスク→期限→当日必要量をCalendarへ落とし、実行する",
    frequency: "DAILY",
    area: "GENESIS",
    estimateMinutes: null,
    aiCapability: "HYBRID",
    description: "全タスクを目的から逆算し、期限・予定時間・実行日を決め、その日に終える必要量をCalendarへ配置して実行する。",
    definitionOfDone: [
      "未期限タスクが確認されている",
      "必要タスクに期限が設定されている",
      "期限から逆算して今日終える必要量が決まっている",
      "Google Calendar等に実行時間が確保されている",
      "実行済み・未達が明確になっている",
      "予定時間を超えた場合、原因が記録されている",
      "期限に間に合わない場合、原因と再計画が記録されている",
    ],
    allowedMedium: ["Google Calendar", "その他"],
    why: "「多分大丈夫」ではなく、実在する時間と期限から逆算して行動できる自分になるため。",
    outcomeId: "o-genesis-60day",
    streakDays: 0,
  },
];
