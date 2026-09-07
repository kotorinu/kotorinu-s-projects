import type { TimeBlock } from "./types";

// TimeBlock overlap detection (2026-09-06, §19). Two blocks on the same day
// whose times intersect are a real planning conflict — never silently
// accepted as normal. Reported, not auto-resolved: the app surfaces the
// clash and the user decides which side moves.

export interface TimeBlockOverlap {
  a: TimeBlock;
  b: TimeBlock;
  overlapMinutes: number;
}

function toMinutes(hm: string): number {
  const [h, m] = hm.split(":").map(Number);
  return h * 60 + m;
}

/** All overlapping pairs among the given day's blocks, earliest first. */
export function findOverlaps(blocks: TimeBlock[]): TimeBlockOverlap[] {
  const sorted = [...blocks].sort((x, y) => (x.startTime < y.startTime ? -1 : x.startTime > y.startTime ? 1 : 0));
  const out: TimeBlockOverlap[] = [];
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      const a = sorted[i];
      const b = sorted[j];
      const overlap = Math.min(toMinutes(a.endTime), toMinutes(b.endTime)) - Math.max(toMinutes(a.startTime), toMinutes(b.startTime));
      if (overlap > 0) out.push({ a, b, overlapMinutes: overlap });
    }
  }
  return out;
}

export function hasOverlap(blocks: TimeBlock[]): boolean {
  return findOverlaps(blocks).length > 0;
}
