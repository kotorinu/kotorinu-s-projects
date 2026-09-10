"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ageCalendarResult, calendarProvider, retainLastCalendar, snapshotEvents, type CalendarFetchResult } from "./calendarProvider";
import { CALENDAR_FRESH_MS, validCalendarDate } from "./calendarTime";

export interface CalendarDayState extends CalendarFetchResult { loading: boolean; refresh: () => void }

export function useCalendarDay(startDate: string, endDate: string): CalendarDayState {
  const [result, setResult] = useState<CalendarFetchResult>(() => snapshotEvents(startDate, endDate, null));
  const [loading, setLoading] = useState(false);
  const refreshRef = useRef<() => void>(() => {});
  const refresh = useCallback(() => refreshRef.current(), []);

  useEffect(() => {
    if (!validCalendarDate(startDate) || !validCalendarDate(endDate) || startDate > endDate) return;
    let cancelled = false, busy = false;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const later = (fn: () => void, ms: number) => {
      const timer = setTimeout(() => { timers.delete(timer); if (!cancelled) fn(); }, ms);
      timers.add(timer);
    };
    const accept = (next: CalendarFetchResult) => {
      if (cancelled) return;
      setResult(old => retainLastCalendar(old, next, startDate, endDate));
      // Only age the label. No background Google polling loop.
      if (!next.stale) later(() => setResult(old => ageCalendarResult(old, Date.now())), Math.max(0, Date.parse(next.readAt) + CALENDAR_FRESH_MS - Date.now()));
    };
    const read = async (manual = false) => {
      if (cancelled || busy) return;
      busy = true; setLoading(true);
      try {
        const saved = await calendarProvider.getEvents(startDate, endDate, { trigger: "CACHE" });
        accept(saved);
        if (cancelled || saved.authRequired) return;
        const next = await calendarProvider.getEvents(startDate, endDate, { trigger: manual ? "MANUAL" : "OPEN" });
        accept(next);
        // Another instance is refreshing: bounded cache-only readbacks, never extra Google calls.
        if (next.refreshing) for (const delay of [5000, 15000, 35000]) later(() => {
          void calendarProvider.getEvents(startDate, endDate, { trigger: "CACHE" }).then(accept);
        }, delay);
      } catch {
        accept(snapshotEvents(startDate, endDate, "Calendarへ接続できません。最後の取得データを表示します"));
      } finally { busy = false; if (!cancelled) setLoading(false); }
    };
    refreshRef.current = () => { void read(true); };
    later(() => { void read(); }, 0);
    const onVisible = () => { if (document.visibilityState === "visible") void read(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { cancelled = true; refreshRef.current = () => {}; timers.forEach(clearTimeout); document.removeEventListener("visibilitychange", onVisible); };
  }, [startDate, endDate]);

  return { ...result, loading, refresh };
}
