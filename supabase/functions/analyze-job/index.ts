// =====================================================================
// Edge Function：analyze-job（求人票をAIで分析して、DBに保存する）
//
// 呼び出し方：POST http://127.0.0.1:54321/functions/v1/analyze-job
//   ヘッダー：Authorization: Bearer <ログインしたユーザーのトークン>
//   本文（JSON）：{ "title": "職種名", "raw_text": "求人票の本文", "company": "会社名", "source_url": "URL" }
//
// 処理の流れ：
//   ① 入力をチェックする
//   ② 誰が呼んだか（ログインユーザー）を確認する
//   ③ Gemini に求人票を渡して、スキル一覧を JSON で返してもらう
//   ④ 求人票を job_postings に保存する
//   ⑤ スキル名を skills の番号に変換する（なければ新規登録）
//   ⑥ 求人とスキルのつながりを job_skills に保存する
// =====================================================================

import { createClient } from "npm:@supabase/supabase-js@2";

// ---------------------------------------------------------------------
// 設定（環境変数から読む。コードに直接キーを書かない）
// SUPABASE_* は Supabase が自動で用意してくれる。GEMINI_API_KEY は .env に書いたもの。
// ---------------------------------------------------------------------
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
const GEMINI_MODEL = Deno.env.get("GEMINI_MODEL") ?? "gemini-3.8-flash";

const MAX_TEXT_LENGTH = 20000; // DB側の上限と合わせる（AIの課金対策）

// ブラウザ（Phase 3 の画面）から呼べるようにするための許可設定。CORS（コルス）と呼ぶ。
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// 型：AIが返すスキル1件の形
type ExtractedSkill = { name: string; requirement: "required" | "preferred" };

// 結果を JSON で返すための小さな道具
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ---------------------------------------------------------------------
// ③ Gemini にスキルを取り出してもらう
// responseSchema で「この形の JSON で返して」と指定するので、
// AIの返事をそのままプログラムで扱える（構造化出力と呼ぶ）。
// ---------------------------------------------------------------------
async function extractSkills(rawText: string): Promise<ExtractedSkill[]> {
  const prompt = `あなたは求人票を分析するアシスタントです。
次の求人票から、応募者に求められている「技術スキル」を取り出してください。

ルール：
- 対象：プログラミング言語、フレームワーク、ライブラリ、データベース、クラウド、開発ツール、資格
- 対象外：ソフトスキル（コミュニケーション力など）、経験年数、業界知識
- 名前は公式の表記にそろえる（例：TS → TypeScript、postgres → PostgreSQL、GCP → Google Cloud）
- AWS の各サービス（Lambda、S3 など）は「AWS」にまとめる。Google Cloud、Azure も同様
- requirement：必須なら "required"、歓迎・尚可・あれば望ましいなら "preferred"
- 同じスキルは1回だけ。最大30件

求人票：
"""
${rawText}
"""`;

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": GEMINI_API_KEY! },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0, // 毎回なるべく同じ答えになるように、ゆらぎをなくす
          responseMimeType: "application/json",
          responseSchema: {
            type: "OBJECT",
            properties: {
              skills: {
                type: "ARRAY",
                items: {
                  type: "OBJECT",
                  properties: {
                    name: { type: "STRING" },
                    requirement: { type: "STRING", enum: ["required", "preferred"] },
                  },
                  required: ["name", "requirement"],
                },
              },
            },
            required: ["skills"],
          },
        },
      }),
    },
  );

  if (!res.ok) {
    // エラーの中身はサーバーのログにだけ出し、呼び出した人には詳細を見せない
    console.error("Gemini API error", res.status, await res.text());
    throw new Error("AIの呼び出しに失敗しました");
  }

  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("AIの返事が空でした");

  const parsed = JSON.parse(text) as { skills: ExtractedSkill[] };
  return parsed.skills;
}

// ---------------------------------------------------------------------
// メインの処理：リクエストが来るたびにここが動く
// ---------------------------------------------------------------------
Deno.serve(async (req) => {
  // ブラウザが本番のリクエストの前に送ってくる「確認のリクエスト」には、許可だけ返す
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "POST で呼んでください" }, 405);

  if (!GEMINI_API_KEY) return json({ error: "サーバーに GEMINI_API_KEY が設定されていません" }, 500);

  // ① 入力チェック -----------------------------------------------------
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "本文が JSON ではありません" }, 400);
  }
  // 外から来るデータは、型が正しいとは限らない。文字列以外は「なし」として扱う
  const str = (v: unknown) => (typeof v === "string" && v.trim() !== "" ? v.trim() : null);
  const title = str(body.title);
  const rawText = str(body.raw_text);
  if (!title || !rawText) return json({ error: "title と raw_text は必須です" }, 400);
  if (rawText.length > MAX_TEXT_LENGTH) {
    return json({ error: `raw_text は ${MAX_TEXT_LENGTH} 文字以内にしてください` }, 400);
  }

  // ② 誰が呼んだかを確認 ------------------------------------------------
  // userClient：呼んだ人の権限で動く。RLS が効くので、その人のデータしか触れない。
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return json({ error: "ログインが必要です" }, 401);

  // adminClient：強い権限（service_role）。skills への登録だけに使う。
  const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // ③ AI でスキルを取り出す（DBに保存する前にやる。失敗したら何も保存しない）
  let skills: ExtractedSkill[];
  try {
    skills = await extractSkills(rawText);
  } catch (e) {
    return json({ error: (e as Error).message }, 502);
  }

  // ④ 求人票を保存（user_id は DB 側で自動的にログインユーザーになる）--------
  const { data: job, error: jobError } = await userClient
    .from("job_postings")
    .insert({ title, raw_text: rawText, company: str(body.company), source_url: str(body.source_url) })
    .select("id")
    .single();
  if (jobError) {
    console.error(jobError);
    return json({ error: "求人票の保存に失敗しました" }, 500);
  }

  // ⑤ スキル名 → 番号 ---------------------------------------------------
  const { data: skillRows, error: skillError } = await adminClient.rpc("get_or_create_skill_ids", {
    p_names: skills.map((s) => s.name),
  });
  if (skillError) {
    console.error(skillError);
    await userClient.from("job_postings").delete().eq("id", job.id); // 途中まで保存したものを取り消す
    return json({ error: "スキルの登録に失敗しました" }, 500);
  }

  // 大文字・小文字を無視して、名前から番号を引ける表を作る
  const idByName = new Map<string, number>(
    (skillRows as { id: number; name: string }[]).map((r) => [r.name.toLowerCase(), r.id]),
  );

  // ⑥ 求人とスキルのつながりを保存 ---------------------------------------
  // 同じスキルが「必須」と「歓迎」の両方で出てきたら、必須を優先する
  const rowsBySkill = new Map<number, { job_id: number; skill_id: number; requirement: string }>();
  for (const s of skills) {
    const skillId = idByName.get(s.name.trim().toLowerCase());
    if (!skillId) continue;
    const current = rowsBySkill.get(skillId);
    if (!current || s.requirement === "required") {
      rowsBySkill.set(skillId, { job_id: job.id, skill_id: skillId, requirement: s.requirement });
    }
  }

  const { error: linkError } = await userClient.from("job_skills").insert([...rowsBySkill.values()]);
  if (linkError) {
    console.error(linkError);
    await userClient.from("job_postings").delete().eq("id", job.id);
    return json({ error: "スキルの紐づけに失敗しました" }, 500);
  }

  // 結果を返す
  return json({
    job_id: job.id,
    skills: [...rowsBySkill.values()].map((r) => ({
      name: (skillRows as { id: number; name: string }[]).find((x) => x.id === r.skill_id)!.name,
      requirement: r.requirement,
    })),
  });
});
