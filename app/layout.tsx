import type { Metadata, Viewport } from "next";
import { Noto_Sans_JP } from "next/font/google";
import "./globals.css";
import BottomNav from "@/components/BottomNav";
import DesktopSidebar from "@/components/DesktopSidebar";
import { TodayExecutionProvider } from "@/lib/todayExecutionStore";

const notoSansJp = Noto_Sans_JP({
  variable: "--font-noto-sans-jp",
  subsets: ["latin"],
  weight: ["400", "500", "700", "900"],
});

export const metadata: Metadata = {
  title: "AI Work OS",
  description: "目標から今日の行動までをつなぐ、自分専用のAI Work OS",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#f5f5f4",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ja" className={`${notoSansJp.variable} h-full`}>
      <body className="h-full min-h-screen bg-stone-200 font-[var(--font-noto-sans-jp)] text-foreground">
        {/* Responsive Root Shell (2026-09-06): mobile keeps the original
            phone-card presentation (max-w-[430px], centered, shadowed).
            From lg (1024px) up, the shell widens to a real desktop layout
            (sidebar + up to 1280px content) instead of staying a narrow
            column floating in grey — "Desktop本対応" DoD item 1. */}
        <div className="mx-auto flex min-h-screen w-full max-w-[430px] flex-col bg-background shadow-[0_0_50px_rgba(0,0,0,0.12)] md:max-w-[600px] lg:max-w-[1280px] lg:flex-row lg:shadow-none">
          <TodayExecutionProvider>
            <DesktopSidebar />
            <div className="flex min-w-0 flex-1 flex-col">
              <main className="flex-1 overflow-y-auto pb-24 lg:pb-10">{children}</main>
              <BottomNav />
            </div>
          </TodayExecutionProvider>
        </div>
      </body>
    </html>
  );
}
