export type Area = "営業代行" | "RIALA" | "GENESIS" | "その他";

export type Owner = "Human" | "AI" | "Hybrid";

export type AiMode = "Execute" | "Draft" | "Assist" | "Decision";

export type TaskStatus = "未着手" | "進行中" | "待ち" | "完了" | "Archive";

export type AiStatus = "未着手" | "実行中" | "人間確認待ち" | "完了" | "Blocked";

export type Priority = "高" | "中" | "低";

export interface Task {
  id: string;
  title: string;
  area: Area;
  deadline: string; // YYYY-MM-DD
  workDate: string | null; // YYYY-MM-DD
  estimateMinutes: number;
  importance: Priority;
  urgency: Priority;
  owner: Owner;
  aiMode: AiMode | null;
  status: TaskStatus;
  aiStatus: AiStatus | null;
  definitionOfDone: string;
  goalId: string | null;
  source: string;
  createdAt: string;
  updatedAt: string;
}

export type GoalStatus = "進行中" | "達成" | "一時停止" | "未達成";

export interface Goal {
  id: string;
  parentId: string | null;
  title: string;
  targetDate: string | null;
  desiredState: string;
  achievementCriteria: string;
  status: GoalStatus;
  createdAt: string;
  updatedAt: string;
}

export interface MonthEndState {
  monthKey: string; // YYYY-MM
  area: Area;
  state: string;
}

export interface RecurringTask {
  id: string;
  title: string;
}
