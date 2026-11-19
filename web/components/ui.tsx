// =====================================================================
// 画面のあちこちで使う、小さな部品（見た目をそろえるため）
// =====================================================================
import type { ReactNode } from "react";

// 白い箱（カード）
export function Card({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-base font-bold">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

// 「必須」「歓迎」のラベル
export function RequirementBadge({ requirement }: { requirement: "required" | "preferred" }) {
  return requirement === "required" ? (
    <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-700 dark:bg-rose-950 dark:text-rose-300">
      必須
    </span>
  ) : (
    <span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs font-semibold text-sky-700 dark:bg-sky-950 dark:text-sky-300">
      歓迎
    </span>
  );
}

// エラー表示
export function ErrorText({ message }: { message: string | null }) {
  if (!message) return null;
  return <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-950 dark:text-rose-300">{message}</p>;
}

// 入力欄・ボタンの見た目（className として使い回す）
export const inputClass =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 dark:border-zinc-700 dark:bg-zinc-950 dark:focus:ring-indigo-900";

export const buttonClass =
  "rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50";
