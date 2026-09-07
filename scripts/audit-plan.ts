import { activeTimeBlocks, tasks, timeBlocks, outcomes } from "../lib/dummy-data";
import { auditPlacements, isLunchSlot, blockMinutes } from "../lib/schedulingWindows";
import { findOverlaps } from "../lib/overlap";

const req = (id: string) => tasks.find((t) => t.id === id)?.requiredEnvironment ?? null;
const issues = auditPlacements(activeTimeBlocks, req);
console.log("== placement issues ==", issues.length);
issues.forEach((i) => console.log(" ", i.blockId, i.reason, i.detail));

for (const d of ["2026-09-08", "2026-09-09", "2026-09-10", "2026-09-11", "2026-09-15"]) {
  const blocks = activeTimeBlocks.filter((b) => b.date === d).sort((a, b) => (a.startTime < b.startTime ? -1 : 1));
  const ov = findOverlaps(blocks);
  console.log(`\n== ${d} (active ${blocks.length}) overlaps=${ov.length} ==`);
  blocks.forEach((b) =>
    console.log(
      `  ${b.startTime}-${b.endTime} ${b.executionEnvironment.padEnd(13)} ${b.label}  [task=${b.taskId ?? "-"} env=${b.taskId ? req(b.taskId) : "-"}]${isLunchSlot(b) ? ` 昼枠${blockMinutes(b)}分` : ""}`
    )
  );
  ov.forEach((o) => console.log("   ! ", o.a.label, "x", o.b.label, o.overlapMinutes, "min"));
}
console.log("\n== lifecycle counts ==");
const c: Record<string, number> = {};
timeBlocks.forEach((b) => (c[b.lifecycle] = (c[b.lifecycle] ?? 0) + 1));
console.log(c, "total", timeBlocks.length, "active", activeTimeBlocks.length);
console.log("\n== outcomes ==");
outcomes.forEach((o) => console.log(" ", o.area.padEnd(8), o.horizon.padEnd(9), o.deadline ?? "  -  ", o.title));
