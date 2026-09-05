import { capabilityGroup } from "./capability";
import type { AuditStatus, OperationalAudit, Task, Workflow } from "./types";

export function auditStatusLabel(status: AuditStatus): string {
  switch (status) {
    case "ACTIVE":
      return "対応中";
    case "DONE":
      return "完了";
    case "NOT_NEEDED_NOW":
      return "現在不要";
    case "BLOCKED":
      return "不足あり";
    default:
      return "未確認";
  }
}

export const AUDIT_STATUSES: AuditStatus[] = ["ACTIVE", "DONE", "NOT_NEEDED_NOW", "UNKNOWN", "BLOCKED"];

export interface RialaTopStats {
  activeTasks: number;
  blocked: number;
  unknown: number;
  aiReady: number;
  humanDecision: number;
}

export function computeRialaStats(
  audits: OperationalAudit[],
  workflows: Workflow[],
  tasks: Task[]
): RialaTopStats {
  return {
    activeTasks: tasks.filter((t) => t.status !== "完了" && t.status !== "Archive").length,
    blocked: audits.filter((a) => a.currentStatus === "BLOCKED").length,
    unknown: audits.filter((a) => a.currentStatus === "UNKNOWN").length,
    aiReady: workflows.filter((w) => capabilityGroup(w.aiCapability) === "AI").length,
    humanDecision: workflows.filter((w) => w.aiCapability === "HUMAN" || w.aiCapability === "DECISION").length,
  };
}

export interface CategoryAuditCounts {
  active: number;
  done: number;
  notNeededNow: number;
  unknown: number;
  blocked: number;
}

export function countAuditsByCategory(audits: OperationalAudit[], categoryId: string): CategoryAuditCounts {
  const inCategory = audits.filter((a) => a.categoryId === categoryId);
  return {
    active: inCategory.filter((a) => a.currentStatus === "ACTIVE").length,
    done: inCategory.filter((a) => a.currentStatus === "DONE").length,
    notNeededNow: inCategory.filter((a) => a.currentStatus === "NOT_NEEDED_NOW").length,
    unknown: inCategory.filter((a) => a.currentStatus === "UNKNOWN").length,
    blocked: inCategory.filter((a) => a.currentStatus === "BLOCKED").length,
  };
}
