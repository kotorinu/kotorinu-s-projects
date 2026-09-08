"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

// Restoring persisted state has to happen before paint on the client, but
// useLayoutEffect does not exist on the server — same pattern as the store.
const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

type RialaTask = {
  id: string;
  date: string;
  category: "移行対応" | "イベント運営" | "日常コミュニティ運営" | "運営改善・仕組み化";
  title: string;
  criterion: string;
};

type TaskMeasurement = {
  status: "未着手" | "進行中" | "完了";
  elapsedSeconds: number;
  startedAt: number | null;
  completedAt: string | null;
};

const STORAGE_KEY = "ai-work-os:riala-task-measurements:v1";

const tasks: RialaTask[] = [
  {
    id: "riala-migration-check",
    date: "2026-09-07",
    category: "移行対応",
    title: "FANTS → 独自アプリへの未移行者確認",
    criterion: "対象者全員を「移行済／未移行／確認不要／不明」に分類。不明が残る場合は確認先と次Actionまで決める。",
  },
  {
    id: "riala-migration-dm",
    date: "2026-09-08",
    category: "移行対応",
    title: "未移行者へのDM",
    criterion: "DM対象者全員へ案内を送信し、送信済みを記録。送れない人は理由と次Actionを決める。",
  },
  {
    id: "riala-migration-status",
    date: "2026-09-09",
    category: "移行対応",
    title: "移行済み／未移行の管理更新",
    criterion: "対象者ごとに最新ステータス・最終対応日・次Actionを一覧へ反映し、古い状態のままの人を0にする。",
  },
  {
    id: "riala-migration-replies",
    date: "2026-09-10",
    category: "移行対応",
    title: "返信・質問対応",
    criterion: "未返信の移行関連メッセージを0件にする。回答待ちは確認先・質問内容・次回対応まで明確にする。",
  },
  {
    id: "riala-event-schedule",
    date: "2026-09-11",
    category: "イベント運営",
    title: "今後のイベント予定確認",
    criterion: "今後のイベントの開催日・内容・告知期限・必要準備を確認し、次に対応するイベントを明確にする。",
  },
  {
    id: "riala-event-announcement",
    date: "2026-09-12",
    category: "イベント運営",
    title: "告知文作成・投稿",
    criterion: "日時・内容・場所／参加方法を含む告知文を完成させ、対象チャネルへの投稿まで完了する。",
  },
  {
    id: "riala-event-reminder",
    date: "2026-09-13",
    category: "イベント運営",
    title: "開催前リマインド",
    criterion: "日時・参加方法・必要事項を含むリマインドを対象者へ送信し、送信済みを確認する。",
  },
  {
    id: "riala-event-url",
    date: "2026-09-14",
    category: "イベント運営",
    title: "参加方法・URLの案内",
    criterion: "正しい参加方法・URL・必要手順を案内し、リンク切れや不足情報がない状態にする。",
  },
  {
    id: "riala-event-followup",
    date: "2026-09-15",
    category: "イベント運営",
    title: "開催後の必要対応",
    criterion: "お礼・資料共有・記録・次回案内などを完了、または各項目に担当・期限・次Actionを設定する。",
  },
  {
    id: "riala-community-replies",
    date: "2026-09-16",
    category: "日常コミュニティ運営",
    title: "DM・問い合わせ返信",
    criterion: "未返信を0件にする。確認が必要なものは確認先・次回対応日時まで設定する。",
  },
  {
    id: "riala-community-onboarding",
    date: "2026-09-17",
    category: "日常コミュニティ運営",
    title: "新規参加者への案内",
    criterion: "対象の新規参加者全員へ初期案内・参加方法・次に見る場所を案内し、案内漏れを0にする。",
  },
  {
    id: "riala-community-missed",
    date: "2026-09-18",
    category: "日常コミュニティ運営",
    title: "対応漏れチェック",
    criterion: "主要チャネル・管理一覧を確認し、期限超過または担当／次Action未設定の対応漏れを0件にする。",
  },
  {
    id: "riala-community-outreach",
    date: "2026-09-19",
    category: "日常コミュニティ運営",
    title: "必要に応じてメンバーへの声かけ",
    criterion: "フォローが必要なメンバーを確認して対象者へ声かけする。対象がいなければ「本日対象なし」と判断する。",
  },
  {
    id: "riala-ops-notion",
    date: "2026-09-20",
    category: "運営改善・仕組み化",
    title: "Notionの情報整理",
    criterion: "運営で参照する重要情報を最新化し、古い・重複・所在不明の情報を洗い出して整理する。",
  },
  {
    id: "riala-ops-status-list",
    date: "2026-09-21",
    category: "運営改善・仕組み化",
    title: "誰が何の状態かを一覧化",
    criterion: "対象者ごとに「現在の状態／最終対応／次Action／必要なら担当者」が一目で分かる一覧を作る。",
  },
  {
    id: "riala-ops-slack",
    date: "2026-09-22",
    category: "運営改善・仕組み化",
    title: "Slackで確認・相談すべき事項をまとめて送る",
    criterion: "未判断事項を「事実／確認したいこと／希望する判断」に整理し、重複のない1通の相談として送信する。",
  },
  {
    id: "riala-ops-template",
    date: "2026-09-23",
    category: "運営改善・仕組み化",
    title: "定型DM・告知文をテンプレ化",
    criterion: "繰り返し使うDMまたは告知文を最低1種類、差し替え箇所が分かる再利用可能なテンプレとして完成・保存する。",
  },
  {
    id: "riala-ops-ai",
    date: "2026-09-24",
    category: "運営改善・仕組み化",
    title: "「どこまでAIに任せられるか」の整理・自動化",
    criterion: "業務を人間／AI／人間+AIに分類し、AI化候補を最低1つ選定。入力・処理・出力先・人間確認・次の実装Actionまで決める。",
  },
];

const emptyMeasurement = (): TaskMeasurement => ({
  status: "未着手",
  elapsedSeconds: 0,
  startedAt: null,
  completedAt: null,
});

function secondsToLabel(total: number) {
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (hours > 0) return `${hours}時間 ${minutes}分 ${seconds}秒`;
  return `${minutes}分 ${seconds}秒`;
}

export default function RialaTaskTracker() {
  const [open, setOpen] = useState(true);
  // Restored in an effect, not in the initialiser: reading localStorage during
  // render would make the server HTML and the first client render disagree.
  const [measurements, setMeasurements] = useState<Record<string, TaskMeasurement>>({});
  // The clock lives in state and is written only from an effect: reading
  // Date.now() during render is impure and makes the elapsed time jump
  // whenever the component happens to re-render for another reason.
  const [nowMs, setNowMs] = useState(0);
  const hydrated = useRef(false);

  useIsomorphicLayoutEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) setMeasurements(JSON.parse(saved));
    } catch {
      // Ignore malformed local data and start from an empty measurement set.
    } finally {
      hydrated.current = true;
    }
  }, []);

  useEffect(() => {
    if (!hydrated.current) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(measurements));
  }, [measurements]);

  useEffect(() => {
    const hasRunning = Object.values(measurements).some((m) => m.startedAt !== null);
    if (!hasRunning) return;
    const read = () => setNowMs(Date.now());
    const first = window.setTimeout(read, 0);
    const timer = window.setInterval(read, 1000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, [measurements]);

  const getMeasurement = (id: string) => measurements[id] ?? emptyMeasurement();

  const currentElapsed = (m: TaskMeasurement) => {
    if (m.startedAt === null) return m.elapsedSeconds;
    // Before the first tick lands, show the banked time rather than a
    // nonsense span measured from epoch 0.
    if (nowMs === 0) return m.elapsedSeconds;
    return m.elapsedSeconds + Math.max(0, Math.floor((nowMs - m.startedAt) / 1000));
  };

  const start = (id: string) => {
    setMeasurements((prev) => {
      const current = prev[id] ?? emptyMeasurement();
      if (current.startedAt !== null || current.status === "完了") return prev;
      return {
        ...prev,
        [id]: { ...current, status: "進行中", startedAt: Date.now() },
      };
    });
  };

  const stop = (id: string) => {
    setMeasurements((prev) => {
      const current = prev[id] ?? emptyMeasurement();
      if (current.startedAt === null) return prev;
      const added = Math.max(0, Math.floor((Date.now() - current.startedAt) / 1000));
      return {
        ...prev,
        [id]: { ...current, elapsedSeconds: current.elapsedSeconds + added, startedAt: null },
      };
    });
  };

  const complete = (id: string) => {
    setMeasurements((prev) => {
      const current = prev[id] ?? emptyMeasurement();
      const added = current.startedAt === null ? 0 : Math.max(0, Math.floor((Date.now() - current.startedAt) / 1000));
      return {
        ...prev,
        [id]: {
          ...current,
          status: "完了",
          elapsedSeconds: current.elapsedSeconds + added,
          startedAt: null,
          completedAt: new Date().toISOString(),
        },
      };
    });
  };

  const reset = (id: string) => {
    setMeasurements((prev) => ({ ...prev, [id]: emptyMeasurement() }));
  };

  const completedCount = useMemo(
    () => tasks.filter((task) => getMeasurement(task.id).status === "完了").length,
    [measurements],
  );

  const totalSeconds = useMemo(
    () => tasks.reduce((sum, task) => sum + currentElapsed(getMeasurement(task.id)), 0),
    // forceTick intentionally causes re-render while timers run.
    [measurements],
  );

  return (
    <section className="mx-auto w-full max-w-7xl px-4 pt-4 sm:px-6">
      <div className="overflow-hidden rounded-2xl border border-violet-200 bg-white shadow-sm">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
        >
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-violet-50 px-2.5 py-1 text-xs font-semibold text-violet-700">RIALA 計測</span>
              <span className="text-sm text-stone-500">18個の実タスク</span>
            </div>
            <h2 className="mt-2 text-lg font-bold text-stone-900">RIALA タスク実行・時間計測</h2>
          </div>
          <div className="text-right">
            <div className="text-sm font-semibold text-stone-800">{completedCount} / {tasks.length} 完了</div>
            <div className="mt-1 text-xs text-stone-500">累計 {secondsToLabel(totalSeconds)}</div>
            <div className="mt-1 text-xs text-violet-600">{open ? "閉じる" : "開く"}</div>
          </div>
        </button>

        {open && (
          <div className="border-t border-stone-100 px-4 py-4 sm:px-5">
            <p className="mb-4 text-xs leading-5 text-stone-500">
              各タスクはGoogle Calendarの21:30〜22:00枠と対応。開始・停止で実績時間を計測し、達成基準を満たしたら完了にする。
            </p>
            <div className="grid gap-3 lg:grid-cols-2">
              {tasks.map((task) => {
                const m = getMeasurement(task.id);
                const running = m.startedAt !== null;
                const done = m.status === "完了";
                return (
                  <article key={task.id} className="rounded-xl border border-stone-200 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <span className="font-medium text-violet-700">{task.category}</span>
                          <span className="text-stone-400">{task.date}</span>
                          <span className={`rounded-full px-2 py-0.5 font-medium ${done ? "bg-stone-900 text-white" : running ? "bg-violet-100 text-violet-700" : "bg-stone-100 text-stone-600"}`}>
                            {m.status}
                          </span>
                        </div>
                        <h3 className="mt-2 text-sm font-semibold leading-5 text-stone-900">{task.title}</h3>
                      </div>
                      <div className="shrink-0 text-right font-mono text-xs font-semibold text-stone-700">
                        {secondsToLabel(currentElapsed(m))}
                      </div>
                    </div>

                    <div className="mt-3 rounded-lg bg-stone-50 px-3 py-2.5">
                      <div className="text-[11px] font-semibold text-stone-500">達成基準</div>
                      <p className="mt-1 text-xs leading-5 text-stone-700">{task.criterion}</p>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      {!done && !running && (
                        <button type="button" onClick={() => start(task.id)} className="rounded-lg bg-violet-600 px-3 py-2 text-xs font-semibold text-white hover:bg-violet-700">
                          開始
                        </button>
                      )}
                      {!done && running && (
                        <button type="button" onClick={() => stop(task.id)} className="rounded-lg border border-violet-300 bg-white px-3 py-2 text-xs font-semibold text-violet-700 hover:bg-violet-50">
                          一時停止
                        </button>
                      )}
                      {!done && (
                        <button type="button" onClick={() => complete(task.id)} className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-xs font-semibold text-stone-700 hover:bg-stone-50">
                          達成・完了
                        </button>
                      )}
                      {(done || m.elapsedSeconds > 0 || running) && (
                        <button type="button" onClick={() => reset(task.id)} className="rounded-lg px-3 py-2 text-xs font-medium text-stone-400 hover:bg-stone-50 hover:text-stone-600">
                          リセット
                        </button>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
