"use client";
// =====================================================================
// ダッシュボード：Phase 1 で作った2つのビューを表示する
//   ・skill_ranking …… 求人によく出るスキルの順位
//   ・skill_gap     …… 需要が高いのに、学習時間が少ないスキル
// =====================================================================
import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import type { SkillGap, SkillRanking } from "@/lib/types";
import { Card, ErrorText } from "@/components/ui";

export function Dashboard() {
  const [ranking, setRanking] = useState<SkillRanking[] | null>(null);
  const [gap, setGap] = useState<SkillGap[] | null>(null);
  const [jobCount, setJobCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // 画面を開いたときに1回だけ、3つのデータをまとめて取りに行く
  useEffect(() => {
    async function load() {
      // Promise.all …… 3つの問い合わせを「同時に」出して、全部そろうのを待つ（順番に待つより速い）
      const [r, g, c] = await Promise.all([
        supabase.from("skill_ranking").select("*").order("job_count", { ascending: false }).order("required_rate", { ascending: false }).limit(15),
        supabase.from("skill_gap").select("*").order("demand_rate", { ascending: false }).order("study_minutes", { ascending: true }).limit(10),
        supabase.from("job_postings").select("id", { count: "exact", head: true }), // 中身は取らずに件数だけ
      ]);
      if (r.error || g.error || c.error) {
        setError("データの読み込みに失敗しました");
        return;
      }
      setRanking(r.data);
      setGap(g.data);
      setJobCount(c.count ?? 0);
    }
    load();
  }, []);

  if (error) return <ErrorText message={error} />;
  if (!ranking || !gap) return <p className="text-sm text-zinc-500">読み込み中…</p>;

  if (jobCount === 0) {
    return (
      <Card title="ようこそ">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          まだ求人が登録されていません。
          <Link href="/jobs" className="font-semibold text-indigo-600 underline">求人ページ</Link>
          から、気になる求人票を貼り付けて分析してみましょう。
        </p>
      </Card>
    );
  }

  const maxCount = Math.max(...ranking.map((r) => r.job_count));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black tracking-tight">ダッシュボード</h1>
        <p className="text-sm text-zinc-500">分析した求人 {jobCount} 件からの集計</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* ---------- スキルランキング ---------- */}
        <Card title="求められているスキル">
          <ol className="space-y-3">
            {ranking.map((r, i) => (
              <li key={r.skill_id} className="space-y-1">
                <div className="flex items-baseline justify-between gap-2 text-sm">
                  <span>
                    <span className="mr-2 inline-block w-5 text-right font-mono text-zinc-400">{i + 1}</span>
                    <span className="font-semibold">{r.name}</span>
                  </span>
                  <span className="shrink-0 text-xs text-zinc-500">
                    {r.job_count}件 ・ 必須率 {r.required_rate}%
                  </span>
                </div>
                {/* 棒グラフ：一番多いスキルを100%として長さを決める */}
                <div className="ml-7 h-2 rounded-full bg-zinc-100 dark:bg-zinc-800">
                  <div className="h-2 rounded-full bg-indigo-500" style={{ width: `${(r.job_count / maxCount) * 100}%` }} />
                </div>
              </li>
            ))}
          </ol>
        </Card>

        {/* ---------- 不足スキル ---------- */}
        <Card title="次に学ぶべきスキル">
          <p className="mb-3 text-xs text-zinc-500">求人での登場率が高く、学習時間が少ない順</p>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-left text-xs text-zinc-500 dark:border-zinc-800">
                <th className="py-2 font-medium">スキル</th>
                <th className="py-2 text-right font-medium">登場率</th>
                <th className="py-2 text-right font-medium">学習時間</th>
              </tr>
            </thead>
            <tbody>
              {gap.map((g) => (
                <tr key={g.skill_id} className="border-b border-zinc-100 last:border-0 dark:border-zinc-800">
                  <td className="py-2 font-semibold">
                    {g.name}
                    {g.study_minutes === 0 && (
                      <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                        未学習
                      </span>
                    )}
                  </td>
                  <td className="py-2 text-right">{g.demand_rate}%</td>
                  <td className="py-2 text-right">{formatMinutes(g.study_minutes)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
    </div>
  );
}

// 分 → 「2時間30分」のような読みやすい表記に
function formatMinutes(min: number) {
  if (min === 0) return "—";
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? `${h}時間${m > 0 ? `${m}分` : ""}` : `${m}分`;
}
