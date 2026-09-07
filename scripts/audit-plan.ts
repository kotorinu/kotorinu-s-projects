import { activeTimeBlocks, areaProfiles, outcomes, tasks, timeBlocks } from "../lib/dummy-data";
import { auditPlacements, blockMinutes, isLunchSlot } from "../lib/schedulingWindows";
import { findOverlaps } from "../lib/overlap";
import { EXECUTION_BASELINE_DATE } from "../lib/executionBaseline";

const EMPTY = { completions: {}, dispositions: {}, deadlineOverrides: {}, workDateOverrides: {}, lifecycleOverrides: {} };
const req = (id: string) => tasks.find((t) => t.id === id)?.requiredEnvironment ?? null;

console.log("=== Task lifecycle ===");
const byLifecycle: Record<string, string[]> = {};
for (const t of tasks) (byLifecycle[t.lifecycle] ??= []).push(t.title);
for (const [k, v] of Object.entries(byLifecycle)) console.log(`${k}: ${v.length}`);

console.log("\n=== ACTIVE Tasks: schedule + DoD + why ===");
const active = tasks.filter((t) => t.lifecycle === "ACTIVE");
let unscheduled = 0;
for (const t of active) {
  const blocks = activeTimeBlocks.filter((b) => b.taskId === t.id);
  const ok = blocks.length > 0 && t.workDate !== null && t.deadline !== null;
  if (!ok) unscheduled++;
  console.log(
    `${ok ? "OK " : "!! "}${t.title}\n     期限=${t.deadline} workDate=${t.workDate} 枠=${blocks
      .map((b) => `${b.date} ${b.startTime}-${b.endTime}`)
      .join(" / ") || "なし"} DoD=${t.definitionOfDone.length} why3段=${t.whyBreakdown ? "あり" : "なし"} source=${t.sourceLinks.length}`
  );
}
console.log(`\n時間未定のACTIVE Task: ${unscheduled}件`);
console.log(`whyBreakdown無しのACTIVE Task: ${active.filter((t) => !t.whyBreakdown).length}件`);
console.log(`DoD無しのACTIVE Task: ${active.filter((t) => t.definitionOfDone.length === 0).length}件`);

console.log("\n=== placement audit ===");
const issues = auditPlacements(activeTimeBlocks, req);
console.log(issues.length === 0 ? "違反なし" : issues.map((i) => `${i.blockId} ${i.reason} ${i.detail}`).join("\n"));

console.log("\n=== ACTIVE PLAN by day ===");
for (const d of ["2026-09-08", "2026-09-09", "2026-09-10", "2026-09-11", "2026-09-15"]) {
  const blocks = activeTimeBlocks.filter((b) => b.date === d).sort((a, b) => (a.startTime < b.startTime ? -1 : 1));
  const ov = findOverlaps(blocks);
  console.log(`${d} (${blocks.length}件, overlaps=${ov.length})`);
  blocks.forEach((b) =>
    console.log(`   ${b.startTime}-${b.endTime} ${b.label}${isLunchSlot(b) ? ` [昼枠${blockMinutes(b)}分]` : ""}`)
  );
}

console.log("\n=== Outcomes ===");
outcomes.forEach((o) => console.log(` ${o.area.padEnd(8)} ${o.horizon.padEnd(9)} ${o.deadline ?? "  -  "} ${o.title}`));

console.log("\n=== Area profiles ===");
areaProfiles.forEach((p) => console.log(` ${p.area} → /area/${p.slug} blockers=${p.blockers.length} sources=${p.sources.length}`));

console.log("\n=== TimeBlocks ===");
const lc: Record<string, number> = {};
timeBlocks.forEach((b) => (lc[b.lifecycle] = (lc[b.lifecycle] ?? 0) + 1));
console.log(lc, "baseline:", EXECUTION_BASELINE_DATE);
void EMPTY;
