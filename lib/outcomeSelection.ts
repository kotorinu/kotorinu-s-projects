import type { Area, Outcome } from "./types";

// Which Outcome is an Area's current headline (2026-09-08).
//
// An Area can hold both a standing target ("RIALA運営をAI中心で回せる状態に
// する") and the near-term one actually being executed this week ("移行対応を
// 締める"). Showing the standing one — or worse, "Outcome未設定" — hides what
// the user is actually working toward right now, so the nearest horizon wins:
// WEEK → SPRINT → STANDING, and within the same horizon the earliest deadline.
const HORIZON_ORDER: Record<Outcome["horizon"], number> = {
  WEEK: 0,
  SPRINT: 1,
  STANDING: 2,
};

export function pickAreaOutcome(area: Area, outcomes: Outcome[]): Outcome | null {
  const candidates = outcomes.filter((o) => o.area === area && o.status !== "COMPLETE");
  if (candidates.length === 0) return null;
  return [...candidates].sort((a, b) => {
    const h = HORIZON_ORDER[a.horizon] - HORIZON_ORDER[b.horizon];
    if (h !== 0) return h;
    if (a.deadline === b.deadline) return 0;
    if (a.deadline === null) return 1;
    if (b.deadline === null) return -1;
    return a.deadline < b.deadline ? -1 : 1;
  })[0];
}
