"use client";
// =====================================================================
// 求人ページ
//   上：求人票を貼り付けて「AIで分析」→ Phase 2 の Edge Function を呼ぶ
//   下：これまでに分析した求人の一覧（スキル付き）
// =====================================================================
import { useCallback, useEffect, useState } from "react";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import type { JobPosting, Requirement } from "@/lib/types";
import { buttonClass, Card, ErrorText, inputClass, RequirementBadge } from "@/components/ui";

const MAX_LENGTH = 20000; // DB・Edge Function と同じ上限

type AnalyzeResult = { job_id: number; skills: { name: string; requirement: Requirement }[] };

// 求人一覧を取ってくる。job_skills と skills も「つなげて」1回の問い合わせで取る
function fetchJobs() {
  return supabase
    .from("job_postings")
    .select("id, title, company, source_url, created_at, job_skills(requirement, skills(name))")
    .order("created_at", { ascending: false });
}

export function JobsView() {
  const [jobs, setJobs] = useState<JobPosting[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);

  // 求人一覧を読み込む。データが届いてから（.then の中で）画面の状態を更新する
  const loadJobs = useCallback(() => {
    fetchJobs().then(({ data, error }) => {
      if (error) setListError("求人一覧の読み込みに失敗しました");
      else setJobs(data as unknown as JobPosting[]);
    });
  }, []);

  useEffect(() => {
    loadJobs();
  }, [loadJobs]);

  async function handleDelete(job: JobPosting) {
    if (!confirm(`「${job.title}」を削除しますか？`)) return;
    // job_skills は DB の on delete cascade で一緒に消える
    const { error } = await supabase.from("job_postings").delete().eq("id", job.id);
    if (error) alert("削除に失敗しました");
    else loadJobs();
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-black tracking-tight">求人</h1>
      <AnalyzeForm onDone={loadJobs} />

      <Card title={`分析した求人${jobs ? `（${jobs.length}件）` : ""}`}>
        <ErrorText message={listError} />
        {!jobs && !listError && <p className="text-sm text-zinc-500">読み込み中…</p>}
        {jobs?.length === 0 && <p className="text-sm text-zinc-500">まだありません。</p>}
        <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {jobs?.map((job) => (
            <li key={job.id} className="space-y-2 py-4 first:pt-0 last:pb-0">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold">{job.title}</p>
                  <p className="text-xs text-zinc-500">
                    {job.company ?? "会社名なし"} ・ {new Date(job.created_at).toLocaleDateString("ja-JP")}
                    {job.source_url && (
                      <>
                        {" ・ "}
                        <a href={job.source_url} target="_blank" rel="noreferrer" className="text-indigo-600 underline">
                          元の求人
                        </a>
                      </>
                    )}
                  </p>
                </div>
                <button onClick={() => handleDelete(job)} className="shrink-0 text-xs text-zinc-400 hover:text-rose-600">
                  削除
                </button>
              </div>
              <SkillChips skills={job.job_skills.map((js) => ({ name: js.skills?.name ?? "?", requirement: js.requirement }))} />
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------
// 求人票の入力フォーム
// ---------------------------------------------------------------------
function AnalyzeForm({ onDone }: { onDone: () => void }) {
  const [rawText, setRawText] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AnalyzeResult | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    setPending(true);
    setError(null);
    setResult(null);

    // Edge Function を呼ぶ。ログイン中のトークンは supabase が自動で付けてくれる
    const { data: res, error } = await supabase.functions.invoke<AnalyzeResult>("analyze-job", {
      body: {
        title: data.get("title"),
        company: data.get("company"),
        source_url: data.get("source_url"),
        raw_text: rawText,
      },
    });

    if (error) {
      // Edge Function が返したエラーメッセージ（日本語）を取り出して表示する
      let message = "分析に失敗しました。時間をおいてもう一度試してください";
      if (error instanceof FunctionsHttpError) {
        const body = await error.context.json().catch(() => null);
        if (body?.error) message = body.error;
      }
      setError(message);
    } else if (res) {
      setResult(res);
      setRawText("");
      form.reset();
      onDone(); // 一覧を読み込み直す
    }
    setPending(false);
  }

  return (
    <Card title="求人票を分析する">
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block space-y-1 text-sm">
            <span>職種名 <span className="text-rose-600">*</span></span>
            <input name="title" required placeholder="例：Webエンジニア" className={inputClass} />
          </label>
          <label className="block space-y-1 text-sm">
            <span>会社名</span>
            <input name="company" placeholder="例：株式会社〇〇" className={inputClass} />
          </label>
        </div>
        <label className="block space-y-1 text-sm">
          <span>求人のURL</span>
          <input name="source_url" type="url" placeholder="https://..." className={inputClass} />
        </label>
        <label className="block space-y-1 text-sm">
          <span className="flex justify-between">
            <span>求人票の本文 <span className="text-rose-600">*</span></span>
            <span className={rawText.length > MAX_LENGTH ? "text-rose-600" : "text-zinc-400"}>
              {rawText.length.toLocaleString()} / {MAX_LENGTH.toLocaleString()}
            </span>
          </span>
          <textarea
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            required
            rows={10}
            placeholder="求人サイトの「必須スキル」「歓迎スキル」などを、そのまま貼り付けてください"
            className={inputClass}
          />
        </label>
        <p className="text-xs text-zinc-500">※ 本文はAI（Google Gemini）に送信されます。社外秘の情報は貼り付けないでください。</p>
        <ErrorText message={error} />
        <button type="submit" disabled={pending || rawText.length > MAX_LENGTH} className={buttonClass}>
          {pending ? "AIが分析中…" : "AIで分析"}
        </button>
      </form>

      {result && (
        <div className="mt-5 rounded-xl bg-indigo-50 p-4 dark:bg-indigo-950/50">
          <p className="mb-2 text-sm font-semibold">分析結果（{result.skills.length}件のスキル）</p>
          <SkillChips skills={result.skills} />
        </div>
      )}
    </Card>
  );
}

// スキルを「必須 → 歓迎」の順に、チップ（小さなラベル）で並べる
function SkillChips({ skills }: { skills: { name: string; requirement: Requirement }[] }) {
  const sorted = [...skills].sort((a, b) => (a.requirement === b.requirement ? 0 : a.requirement === "required" ? -1 : 1));
  return (
    <ul className="flex flex-wrap gap-2">
      {sorted.map((s) => (
        <li key={s.name} className="flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900">
          <RequirementBadge requirement={s.requirement} />
          {s.name}
        </li>
      ))}
    </ul>
  );
}
