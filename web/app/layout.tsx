// =====================================================================
// 全ページ共通の外枠（レイアウト）
// どのページを開いても、まず AuthGate（ログインの門番）を通る
// =====================================================================
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AuthGate } from "@/components/auth-gate";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "SkillScope",
  description: "求人票をAIで分析し、学ぶべきスキルを見える化するアプリ",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ja" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
        <AuthGate>{children}</AuthGate>
      </body>
    </html>
  );
}
