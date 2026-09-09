"use client";

import { useEffect, useState } from "react";
import type { CompletionFeedback } from "@/lib/completionFeedback";

// 完了フィードバック (2026-09-08 第5ラウンド, §49).
//
// Appears for a few seconds after finishing something and says what changed —
// in figures, not praise. Fast and subtle (§59): 240ms in, no bounce, no
// emoji shower. A milestone gets a slightly warmer treatment and nothing more.
export default function CompletionToast({
  feedback,
  onDismiss,
}: {
  feedback: CompletionFeedback;
  onDismiss: () => void;
}) {
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setShown(true));
    const timer = setTimeout(onDismiss, feedback.celebrate === "MILESTONE" ? 5200 : 3800);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(timer);
    };
  }, [feedback, onDismiss]);

  const milestone = feedback.celebrate === "MILESTONE";

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[88px] z-[70] flex justify-center px-5 lg:bottom-8">
      <div
        className="pointer-events-auto w-full max-w-[380px] rounded-2xl border bg-white px-4 py-3 shadow-lg transition-all duration-[240ms] ease-out"
        style={{
          borderTopColor: milestone ? "#51B749" : "#EAE8E6",
          borderRightColor: milestone ? "#51B749" : "#EAE8E6",
          borderBottomColor: milestone ? "#51B749" : "#EAE8E6",
          borderLeftWidth: 3,
          borderLeftColor: milestone ? "#51B749" : "#5484ED",
          opacity: shown ? 1 : 0,
          transform: shown ? "translateY(0)" : "translateY(8px)",
        }}
      >
        <div className="flex items-start gap-2">
          <span
            className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] font-black text-white"
            style={{ backgroundColor: milestone ? "#51B749" : "#5484ED" }}
          >
            ✓
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-bold leading-snug text-stone-800">{feedback.headline}</p>
            {feedback.changed.length > 0 && (
              <ul className="mt-1 flex flex-col gap-0.5">
                {feedback.changed.map((c) => (
                  <li key={c} className="text-[11px] leading-snug text-stone-500">
                    {c}
                  </li>
                ))}
              </ul>
            )}
            {feedback.unlocked && (
              <p className="mt-1 text-[11px] font-bold text-[#2C55B8]">{feedback.unlocked}</p>
            )}
            {/* §37/§51: 完了した瞬間が、次の見積りを直す一番いいタイミング。
                ただし提案までで、勝手には変えない。採用はPDCAで押す。 */}
            {feedback.nextEstimate && (
              <p className="mt-1 text-[11px] font-bold text-stone-500">
                次回候補 {feedback.nextEstimate.minutes}分（{feedback.nextEstimate.confidence}）
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onDismiss}
            aria-label="閉じる"
            className="shrink-0 text-[12px] text-stone-300"
          >
            ✕
          </button>
        </div>
      </div>
    </div>
  );
}
