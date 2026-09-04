import type { AiCapability } from "./types";

// Compact badge shown in TODAY / TASK MAP task rows.
export function capabilityBadge(cap: AiCapability): { label: string; tone: "accent" | "warning" | null } {
  switch (cap) {
    case "AI_EXECUTE":
    case "AI_DRAFT":
      return { label: "AI", tone: "accent" };
    case "HYBRID":
    case "DECISION":
      return { label: "Hybrid", tone: "accent" };
    case "BLOCKED":
      return { label: "Blocked", tone: "warning" };
    default:
      return { label: "Human", tone: null };
  }
}

// "担当" label used in the detail drawer.
export function capabilityOwnerLabel(cap: AiCapability): string {
  switch (cap) {
    case "AI_EXECUTE":
    case "AI_DRAFT":
      return "AI";
    case "HYBRID":
      return "Hybrid";
    case "DECISION":
      return "Hybrid（意思決定は人間）";
    case "BLOCKED":
      return "AI（要準備）";
    default:
      return "Human";
  }
}

export interface CapabilityAction {
  headline: string;
  buttonLabel: string | null;
  runningLabel: string | null;
}

export function capabilityAction(cap: AiCapability): CapabilityAction {
  switch (cap) {
    case "AI_EXECUTE":
      return { headline: "AIで実行できます", buttonLabel: "AIに任せる", runningLabel: "依頼しました" };
    case "AI_DRAFT":
      return { headline: "AIが下書きを作成できます", buttonLabel: "下書きを作成", runningLabel: "作成を依頼しました" };
    case "HYBRID":
      return { headline: "AIが前処理し、あなたが仕上げます", buttonLabel: "AIに前処理を依頼", runningLabel: "前処理を依頼しました" };
    case "DECISION":
      return { headline: "AIが案を提示します（最終判断はあなた）", buttonLabel: "AI案を見る", runningLabel: "案を依頼しました" };
    default:
      return { headline: "", buttonLabel: null, runningLabel: null };
  }
}
