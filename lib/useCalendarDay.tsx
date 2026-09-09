"use client";

import { useCallback, useEffect, useState } from "react";
import {
  calendarProvider,
  snapshotEvents,
  type CalendarFetchResult,
} from "./calendarProvider";

// TODAYがCalendarを読むときの入口 (2026-09-09, §15).
//
// 二段構え:
//   1. 最初の描画はSnapshotから。同期的なので、静的プリレンダリングでも
//      サーバとクライアントで同じHTMLになり、開いた瞬間に予定が見える。
//   2. マウント後にProviderへ取りに行く。Liveが使えるならそちらへ差し替わり、
//      使えなければSnapshotのまま——**そしてsourceがSNAPSHOTのままになる**。
//
// 定期Pollingはしない。開いたときと、押したときだけ。予定表は秒単位で
// 変わるものではないし、無駄に叩く理由がない。

export interface CalendarDayState extends CalendarFetchResult {
  loading: boolean;
  refresh: () => void;
}

export function useCalendarDay(startDate: string, endDate: string): CalendarDayState {
  // 初期値はSnapshotの同期読み取り。fallbackReasonは「まだ取りに行っていない」
  // だけなので null にしておく。
  const [result, setResult] = useState<CalendarFetchResult>(() =>
    snapshotEvents(startDate, endDate, null)
  );
  const [loading, setLoading] = useState(false);
  const [nonce, setNonce] = useState(0);

  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    // 日付が確定する前（hydration placeholder）は取りに行かない。
    if (startDate > endDate) return;
    let cancelled = false;
    // setStateをeffect本体から直接呼ばない（cascading renderの警告になる）。
    const kickoff = setTimeout(() => {
      if (cancelled) return;
      setLoading(true);
      calendarProvider
        .getEvents(startDate, endDate)
        .then((fetched) => {
          if (!cancelled) setResult(fetched);
        })
        .catch(() => {
          if (!cancelled) {
            setResult(snapshotEvents(startDate, endDate, "Calendarへ接続できませんでした"));
          }
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 0);

    return () => {
      cancelled = true;
      clearTimeout(kickoff);
    };
  }, [startDate, endDate, nonce]);

  return { ...result, loading, refresh };
}
