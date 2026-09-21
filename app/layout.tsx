import type { Metadata, Viewport } from "next";
import "./globals.css";
import BottomNav from "@/components/BottomNav";
import DesktopSidebar from "@/components/DesktopSidebar";
import { TodayExecutionProvider } from "@/lib/todayExecutionStore";
import { ClockProvider } from "@/lib/currentTime";
import { BUILT_AT, COMMIT_SHA } from "@/lib/buildInfo";
import { WorkProvider } from "@/lib/work/client";
import PwaRegistration from "@/components/PwaRegistration";

export const metadata: Metadata = {
  title: "AI Work OS",
  description: "目標から今日の行動までをつなぐ、自分専用のAI Work OS",
  appleWebApp: { capable: true, title: "Work OS", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#087f6b",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ja" className="h-full">
      {/* Which build this is, readable without opening the UI (§P5). */}
      <head>
        <meta name="x-commit-sha" content={COMMIT_SHA} />
        <meta name="x-built-at" content={BUILT_AT} />
      </head>
      <body className="h-full min-h-screen font-[var(--font-noto-sans-jp)] text-foreground">
        <a href="#workspace-main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-white focus:p-4">本文へ移動</a>
        <PwaRegistration />
        {/* A single responsive workspace, without a simulated phone frame. */}
        <div className="mx-auto flex min-h-screen w-full max-w-[1600px] flex-col bg-background lg:flex-row">
          <WorkProvider><TodayExecutionProvider>
            <ClockProvider>
            <DesktopSidebar />
            <div className="flex min-w-0 flex-1 flex-col">
              <main id="workspace-main" tabIndex={-1} className="min-w-0 flex-1 pb-6 lg:pb-10">{children}</main>
              <BottomNav />
            </div>
            </ClockProvider>
          </TodayExecutionProvider></WorkProvider>
        </div>
      </body>
    </html>
  );
}
