"use client";
// =====================================================================
// 学習ログページ
//   上：「どのスキルを何分勉強したか」を記録する
//   下：記録の一覧
// ここで記録した時間が、ダッシュボードの「次に学ぶべきスキル」に反映される
// =====================================================================
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Skill, StudyLog } from "@/lib/types";
import { buttonClass, Card, ErrorText, inputClass } from "@/components/ui";

export function StudyView() {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [logs, setLogs] = useState<StudyLog[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  // データが届いてから（.then の中で）画面の状態を更新する
  const loadLogs = useCallback(() => {
    supabase
      .from("study_logs")
      .select("id, minutes, note, studied_on, skills(name)")
      .order("studied_on", { ascending: false })
      .order("id", { ascending: false })
      .limit(50)
      .then(({ data, error }) => {
        if (error) setError("学習ログの読み込みに失敗しました");
        else setLogs(data as unknown as StudyLog[]);
      });
  }, []);

  useEffect(() => {
    // スキルの選択肢（求人の分析で登録されたもの）と、学習ログを読み込む
    supabase.from("skills").select("id, name").order("name").then(({ data }) => setSkills(data ?? []));
    loadLogs();
  }, [loadLogs]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    setPending(true);
    setError(null);
    // user_id は書かなくてよい（DB 側で、ログイン中のユーザーが自動で入る）
    const { error } = await supabase.from("study_logs").insert({
      skill_id: Number(data.get("skill_id")),
      minutes: Number(data.get("minutes")),
      studied_on: String(data.get("studied_on")),
      note: String(data.get("note") ?? "").trim() || null,
    });
    if (error) setError("記録に失敗しました");
    else {
      form.reset();
      loadLogs();
    }
    setPending(false);
  }

  async function handleDelete(id: number) {
    if (!confirm("この記録を削除しますか？")) return;
    await supabase.from("study_logs").delete().eq("id", id);
    loadLogs();
  }

  const today = new Date().toLocaleDateString("sv-SE"); // 「2026-11-20」の形式で今日の日付

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-black tracking-tight">学習ログ</h1>

      <Card title="勉強した時間を記録する">
        {skills.length === 0 ? (
          <p className="text-sm text-zinc-500">先に求人を分析すると、スキルを選べるようになります。</p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="block space-y-1 text-sm">
                <span>スキル</span>
                <select name="skill_id" required className={inputClass}>
                  {skills.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </label>
              <label className="block space-y-1 text-sm">
                <span>時間（分）</span>
                <input name="minutes" type="number" min={1} max={1440} required defaultValue={60} className={inputClass} />
              </label>
              <label className="block space-y-1 text-sm">
                <span>日付</span>
                <input name="studied_on" type="date" required defaultValue={today} className={inputClass} />
              </label>
            </div>
            <label className="block space-y-1 text-sm">
              <span>メモ</span>
              <input name="note" placeholder="例：Supabaseのマイグレーションを理解した" className={inputClass} />
            </label>
            <ErrorText message={error} />
            <button type="submit" disabled={pending} className={buttonClass}>
              {pending ? "記録中…" : "記録する"}
            </button>
          </form>
        )}
      </Card>

      <Card title="最近の記録">
        {!logs && <p className="text-sm text-zinc-500">読み込み中…</p>}
        {logs?.length === 0 && <p className="text-sm text-zinc-500">まだありません。</p>}
        <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {logs?.map((log) => (
            <li key={log.id} className="flex items-start justify-between gap-3 py-3 text-sm first:pt-0 last:pb-0">
              <div>
                <p>
                  <span className="font-semibold">{log.skills?.name}</span>
                  <span className="ml-2 text-zinc-500">{log.minutes}分</span>
                </p>
                {log.note && <p className="text-xs text-zinc-500">{log.note}</p>}
              </div>
              <div className="flex shrink-0 items-center gap-3 text-xs text-zinc-400">
                <span>{log.studied_on}</span>
                <button onClick={() => handleDelete(log.id)} className="hover:text-rose-600">削除</button>
              </div>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
