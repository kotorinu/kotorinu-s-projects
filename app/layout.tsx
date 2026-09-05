import type { Metadata, Viewport } from "next";
import { Noto_Sans_JP } from "next/font/google";
import "./globals.css";
import BottomNav from "@/components/BottomNav";
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
        <div className="mx-auto flex min-h-screen w-full max-w-[430px] flex-col bg-background shadow-[0_0_50px_rgba(0,0,0,0.12)]">
          <TodayExecutionProvider>
            <main className="flex-1 overflow-y-auto pb-24">{children}</main>
            <BottomNav />
          </TodayExecutionProvider>
        </div>
      </body>
    </html>
  );
}
