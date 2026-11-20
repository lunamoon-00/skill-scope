"use client";
// =====================================================================
// 面接練習ページ（Phase 5）
//   ① 「質問をもらう」→ AWS Lambda が、学習ログをもとに AI（Bedrock）で質問を作る
//   ② 回答を書いて「採点してもらう」→ 「課題→手段→理由→成果」で100点満点で採点
//   ③ 下に、これまでの練習の記録
// Lambda には「ログインの証明書（アクセストークン）」を付けて呼ぶ。
// Lambda はその証明書で Supabase に問い合わせるので、本人のデータしか扱えない。
// =====================================================================
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { InterviewSession } from "@/lib/types";
import { buttonClass, Card, ErrorText, inputClass } from "@/components/ui";

const API_URL = process.env.NEXT_PUBLIC_INTERVIEW_API_URL;
const MAX_ANSWER = 3000;

type Breakdown = { problem: number; approach: number; reason: number; result: number };
type Feedback = { score: number; breakdown: Breakdown; feedback: string };

// Lambda を呼ぶ共通の関数
async function callCoach<T>(body: object): Promise<T> {
  if (!API_URL) throw new Error("面接コーチのURL（NEXT_PUBLIC_INTERVIEW_API_URL）が設定されていません");
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("ログインし直してください");

  const res = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? `エラーが起きました（${res.status}）`);
  return json as T;
}

export function InterviewView() {
  const [current, setCurrent] = useState<{ session_id: number; question: string } | null>(null);
  const [result, setResult] = useState<Feedback | null>(null);
  const [history, setHistory] = useState<InterviewSession[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<"question" | "answer" | null>(null);
  const [answer, setAnswer] = useState("");

  const loadHistory = useCallback(() => {
    supabase
      .from("interview_sessions")
      .select("id, question, answer, feedback, score, created_at")
      .not("answer", "is", null)
      .order("created_at", { ascending: false })
      .limit(20)
      .then(({ data, error }) => {
        if (error) setError("記録の読み込みに失敗しました");
        else setHistory(data);
      });
  }, []);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  async function handleQuestion() {
    setPending("question");
    setError(null);
    setResult(null);
    setAnswer("");
    try {
      setCurrent(await callCoach({ action: "question" }));
    } catch (e) {
      setError((e as Error).message);
    }
    setPending(null);
  }

  async function handleAnswer(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!current) return;
    setPending("answer");
    setError(null);
    try {
      setResult(await callCoach({ action: "answer", session_id: current.session_id, answer }));
      loadHistory();
    } catch (e) {
      setError((e as Error).message);
    }
    setPending(null);
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-black tracking-tight">面接練習</h1>

      <Card
        title="AI面接官に質問してもらう"
        action={
          <button onClick={handleQuestion} disabled={pending !== null} className={buttonClass}>
            {pending === "question" ? "考え中…" : current ? "別の質問にする" : "質問をもらう"}
          </button>
        }
      >
        <p className="mb-4 text-xs text-zinc-500">
          学習ログと、求人によく出るスキルをもとに質問を作ります。「課題 → 手段 → 理由 → 成果」の順で答えるのがコツです。
          入力した内容は AWS の AI（Amazon Bedrock）に送られます。
        </p>

        <ErrorText message={error} />

        {current && (
          <div className="mt-4 space-y-4">
            <p className="rounded-xl bg-indigo-50 p-4 font-semibold text-indigo-900 dark:bg-indigo-950 dark:text-indigo-100">
              Q. {current.question}
            </p>

            {!result ? (
              <form onSubmit={handleAnswer} className="space-y-3">
                <textarea
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                  required
                  maxLength={MAX_ANSWER}
                  rows={8}
                  placeholder="課題：… 手段：… 理由：… 成果：…"
                  className={inputClass}
                />
                <div className="flex items-center justify-between">
                  <span className="text-xs text-zinc-400">{answer.length} / {MAX_ANSWER}</span>
                  <button type="submit" disabled={pending !== null || !answer.trim()} className={buttonClass}>
                    {pending === "answer" ? "採点中…" : "採点してもらう"}
                  </button>
                </div>
              </form>
            ) : (
              <FeedbackView result={result} />
            )}
          </div>
        )}
      </Card>

      <Card title="これまでの練習">
        {!history && <p className="text-sm text-zinc-500">読み込み中…</p>}
        {history?.length === 0 && <p className="text-sm text-zinc-500">まだありません。</p>}
        <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {history?.map((s) => (
            <li key={s.id} className="py-3 text-sm first:pt-0 last:pb-0">
              <details>
                <summary className="flex cursor-pointer items-start justify-between gap-3">
                  <span className="font-semibold">{s.question}</span>
                  <span className="shrink-0 font-black text-indigo-600">{s.score}点</span>
                </summary>
                <div className="mt-2 space-y-2 text-xs text-zinc-600 dark:text-zinc-400">
                  <p className="whitespace-pre-wrap">
                    <span className="font-semibold">回答：</span>
                    {s.answer}
                  </p>
                  <p className="whitespace-pre-wrap">
                    <span className="font-semibold">講評：</span>
                    {s.feedback}
                  </p>
                  <p className="text-zinc-400">{new Date(s.created_at).toLocaleString("ja-JP")}</p>
                </div>
              </details>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

// 採点結果：合計点と、4つの観点ごとの点数（各25点満点）
function FeedbackView({ result }: { result: Feedback }) {
  const items: [string, number][] = [
    ["課題", result.breakdown.problem],
    ["手段", result.breakdown.approach],
    ["理由", result.breakdown.reason],
    ["成果", result.breakdown.result],
  ];
  return (
    <div className="space-y-4">
      <p className="text-4xl font-black text-indigo-600">
        {result.score}
        <span className="text-base text-zinc-500"> / 100点</span>
      </p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {items.map(([label, value]) => (
          <div key={label} className="space-y-1">
            <div className="flex justify-between text-xs">
              <span className="font-semibold">{label}</span>
              <span className="text-zinc-500">{value}/25</span>
            </div>
            <div className="h-2 rounded-full bg-zinc-100 dark:bg-zinc-800">
              <div className="h-2 rounded-full bg-indigo-500" style={{ width: `${(value / 25) * 100}%` }} />
            </div>
          </div>
        ))}
      </div>
      <p className="whitespace-pre-wrap rounded-xl bg-zinc-50 p-4 text-sm leading-relaxed dark:bg-zinc-950">{result.feedback}</p>
    </div>
  );
}
