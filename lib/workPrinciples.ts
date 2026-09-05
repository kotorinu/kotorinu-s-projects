import type { WorkContextMapping, WorkContextTag, WorkPrinciple, WorkPrincipleId } from "./types";

export const WORK_CONTEXT_LABEL: Record<WorkContextTag, string> = {
  SLACK_CONSULTATION: "Slack相談",
  RIALA_ANNOUNCEMENT: "RIALA告知文",
  SALES_FEEDBACK_CONSULTATION: "営業FB相談",
  REFLECTION: "振り返り",
  KEY_DELIVERABLE: "重要成果物",
};

// The confirmed context → principle mappings (PRD.md §26 「Taskとの連携」).
// Never show every Principle on every Task — only what a context lists here.
export const WORK_CONTEXT_PRINCIPLES: Record<WorkContextTag, WorkContextMapping> = {
  SLACK_CONSULTATION: {
    principleIds: ["PURPOSE_FIRST", "FACT_INTERPRETATION", "SHORT_SENTENCE"],
    usesHelpNeed: true,
  },
  RIALA_ANNOUNCEMENT: {
    principleIds: ["PURPOSE_FIRST", "CONCLUSION_FIRST", "SHORT_SENTENCE"],
    usesHelpNeed: false,
  },
  SALES_FEEDBACK_CONSULTATION: {
    principleIds: ["PURPOSE_FIRST", "FACT_INTERPRETATION"],
    usesHelpNeed: true,
  },
  REFLECTION: {
    principleIds: ["FACT_INTERPRETATION"],
    usesHelpNeed: false,
  },
  KEY_DELIVERABLE: {
    principleIds: ["QUALITY_BAR"],
    usesHelpNeed: false,
  },
};

export function principleById(principles: WorkPrinciple[], id: WorkPrincipleId): WorkPrinciple | undefined {
  return principles.find((p) => p.id === id);
}

export function principlesForContext(principles: WorkPrinciple[], context: WorkContextTag): WorkPrinciple[] {
  return WORK_CONTEXT_PRINCIPLES[context].principleIds
    .map((id) => principleById(principles, id))
    .filter((p): p is WorkPrinciple => p !== undefined);
}
