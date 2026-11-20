"use client";
// =====================================================================
// ログインしているかどうかで、表示を切り替える「門番」
//   ・確認中      → 「読み込み中」
//   ・ログアウト中 → ログイン画面
//   ・ログイン中   → ヘッダー＋各ページの中身
//
// "use client" …… このファイルはブラウザで動く（クリックや入力に反応できる）
// =====================================================================
import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { buttonClass, ErrorText, inputClass } from "@/components/ui";

export function AuthGate({ children }: { children: ReactNode }) {
  // undefined＝まだ確認中、null＝ログアウト中、Session＝ログイン中
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    // ① ページを開いたとき：保存されているログイン情報を確認
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    // ② ログイン・ログアウトしたとき：自動で表示を切り替える
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => data.subscription.unsubscribe(); // 画面を離れたら見張りをやめる
  }, []);

  if (session === undefined) {
    return <p className="p-10 text-center text-sm text-zinc-500">読み込み中…</p>;
  }
  if (!session) return <LoginForm />;

  return (
    <>
      <Header email={session.user.email ?? ""} />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">{children}</main>
    </>
  );
}

// ---------------------------------------------------------------------
// 上部のメニュー
// ---------------------------------------------------------------------
const NAV = [
  { href: "/", label: "ダッシュボード" },
  { href: "/jobs", label: "求人" },
  { href: "/study", label: "学習ログ" },
  { href: "/interview", label: "面接練習" },
];

function Header({ email }: { email: string }) {
  const pathname = usePathname(); // 今開いているページのURL（メニューの強調に使う）

  return (
    <header className="border-b border-zinc-200 bg-white/80 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/80">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
        <Link href="/" className="text-lg font-black tracking-tight">
          Skill<span className="text-indigo-600">Scope</span>
        </Link>
        <nav className="flex gap-1">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`rounded-lg px-3 py-1.5 text-sm ${
                pathname === item.href
                  ? "bg-indigo-50 font-semibold text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300"
                  : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-900"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-3 text-xs text-zinc-500">
          <span className="hidden sm:inline">{email}</span>
          <button onClick={() => supabase.auth.signOut()} className="rounded-lg border border-zinc-300 px-3 py-1.5 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900">
            ログアウト
          </button>
        </div>
      </div>
    </header>
  );
}

// ---------------------------------------------------------------------
// ログイン画面
// 新規登録はつけない（ユーザーは Supabase のダッシュボードで作る）
// ---------------------------------------------------------------------
function LoginForm() {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); // フォーム送信でページが再読み込みされるのを止める
    setPending(true);
    setError(null);
    const form = new FormData(e.currentTarget);
    const { error } = await supabase.auth.signInWithPassword({
      email: String(form.get("email")),
      password: String(form.get("password")),
    });
    // 成功したら onAuthStateChange が気づいて、自動で画面が切り替わる
    // パスワード違い以外のエラー（設定ミス・通信エラーなど）は、原因が分かるように中身も出す
    if (error) {
      setError(
        error.code === "invalid_credentials"
          ? "メールアドレスかパスワードが違います"
          : `ログインできませんでした（${error.message}）`,
      );
    }
    setPending(false);
  }

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-16">
      <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-4 rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <div className="space-y-1 text-center">
          <h1 className="text-2xl font-black tracking-tight">
            Skill<span className="text-indigo-600">Scope</span>
          </h1>
          <p className="text-sm text-zinc-500">求人から、学ぶべきスキルを見つける</p>
        </div>
        <label className="block space-y-1 text-sm">
          <span>メールアドレス</span>
          <input name="email" type="email" required autoComplete="email" className={inputClass} />
        </label>
        <label className="block space-y-1 text-sm">
          <span>パスワード</span>
          <input name="password" type="password" required autoComplete="current-password" className={inputClass} />
        </label>
        <ErrorText message={error} />
        <button type="submit" disabled={pending} className={`${buttonClass} w-full`}>
          {pending ? "ログイン中…" : "ログイン"}
        </button>
      </form>
    </main>
  );
}
