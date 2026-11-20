"""
=====================================================================
Phase 5：面接コーチ（AWS Lambda ＋ Amazon Bedrock）

画面（Next.js）から呼ばれて、次の2つのことをする：
  ① action = "question"
     学習ログと不足スキルをもとに、Bedrock の AI が面接の質問を1つ作る
     → interview_sessions に質問を保存して返す
  ② action = "answer"
     ユーザーの回答を「課題→手段→理由→成果」の4つの観点で AI が採点する
     → 点数と講評を interview_sessions に保存して返す

セキュリティの考え方：
  - 画面から送られてくる「ログインの証明書（アクセストークン）」をそのまま使って
    Supabase に問い合わせる。だから RLS が効いて、本人のデータしか読み書きできない。
  - そのため、AWS 側に Supabase の強いキー（Secret key）を置く必要がない。
  - Bedrock を呼ぶ権限は、Lambda の「実行ロール（IAM ロール）」で与える。
    アクセスキーをプログラムに書かない。

ライブラリ：
  boto3（ボトスリー／AWS を Python から操作するライブラリ）は
  Lambda に最初から入っているので、追加のインストールは不要。
=====================================================================
"""

import base64
import json
import os
import urllib.error
import urllib.request

import boto3
from botocore.exceptions import ClientError

# ---------------------------------------------------------------------
# 設定（Lambda の「環境変数」で渡す）
# ---------------------------------------------------------------------
SUPABASE_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
# 公開してよいほうのキー（Publishable key）。強いキーではない
SUPABASE_PUBLISHABLE_KEY = os.environ.get("SUPABASE_PUBLISHABLE_KEY", "")
# 使う AI モデル（Amazon Nova Lite）。どの ID が使えるかはリージョンによって違うので、
# Bedrock の画面で確認した値を環境変数で渡す
MODEL_ID = os.environ.get("BEDROCK_MODEL_ID", "amazon.nova-lite-v1:0")
# Bedrock を呼ぶリージョン。空なら Lambda と同じリージョン
BEDROCK_REGION = os.environ.get("BEDROCK_REGION") or None

MAX_ANSWER_LENGTH = 3000  # 回答の文字数の上限（使いすぎ防止）

# Bedrock を呼ぶための道具。関数の外で作ると、2回目以降の呼び出しで使い回されて速くなる
bedrock = boto3.client("bedrock-runtime", region_name=BEDROCK_REGION)


# ---------------------------------------------------------------------
# 小さな道具
# ---------------------------------------------------------------------
class HttpError(Exception):
    """画面にエラーを返すための例外。status は HTTP のステータスコード"""

    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status = status
        self.message = message


def response(status: int, body: dict) -> dict:
    """Lambda の関数 URL が受け取れる形で返事を作る"""
    return {
        "statusCode": status,
        "headers": {"Content-Type": "application/json"},
        "body": json.dumps(body, ensure_ascii=False),
    }


def supabase(method: str, path: str, token: str, body=None, prefer: str = ""):
    """Supabase の REST API を「ログインしている本人として」呼ぶ"""
    headers = {
        "apikey": SUPABASE_PUBLISHABLE_KEY,
        "Authorization": f"Bearer {token}",  # ← 本人の証明書。これで RLS が効く
        "Content-Type": "application/json",
    }
    if prefer:
        headers["Prefer"] = prefer
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(
        f"{SUPABASE_URL}{path}", data=data, headers=headers, method=method
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as res:
            text = res.read().decode()
            return json.loads(text) if text else None
    except urllib.error.HTTPError as e:
        if e.code == 401:
            raise HttpError(401, "ログインの有効期限が切れています。ログインし直してください")
        print(f"Supabase エラー {e.code}: {e.read().decode()[:500]}")
        raise HttpError(502, "データベースとの通信に失敗しました")


def ask_ai(system: str, prompt: str, tool_name: str, schema: dict) -> dict:
    """
    Bedrock の Converse API（コンバース／会話用の共通の呼び方）で AI に聞く。
    「この形の JSON で答えて」と決めるために、tool（ツール）の仕組みを使い、
    必ずそのツールを使うように指定する（＝決まった形でしか答えられなくなる）。
    """
    try:
        res = _converse(system, prompt, tool_name, schema)
    except ClientError as e:  # Bedrock 側のエラー（権限・使用制限など）
        print(f"Bedrock エラー: {e}")
        raise HttpError(503, "AIが今は使えない状態です。時間をおいて試してください")

    usage = res.get("usage", {})
    print(f"Bedrock 使用量：入力 {usage.get('inputTokens')} / 出力 {usage.get('outputTokens')} トークン")

    for block in res["output"]["message"]["content"]:
        if "toolUse" in block:
            return block["toolUse"]["input"]
    raise HttpError(502, "AIの返事を読み取れませんでした")


def _converse(system: str, prompt: str, tool_name: str, schema: dict) -> dict:
    return bedrock.converse(
        modelId=MODEL_ID,
        system=[{"text": system}],
        messages=[{"role": "user", "content": [{"text": prompt}]}],
        inferenceConfig={"maxTokens": 1000, "temperature": 0.5},
        toolConfig={
            "tools": [
                {
                    "toolSpec": {
                        "name": tool_name,
                        "inputSchema": {"json": schema},
                    }
                }
            ],
            "toolChoice": {"tool": {"name": tool_name}},
        },
    )


# ---------------------------------------------------------------------
# ① 質問を作る
# ---------------------------------------------------------------------
def make_question(token: str) -> dict:
    # 不足スキル（求人によく出る順）と、最近の学習ログを取ってくる
    gaps = supabase(
        "GET",
        "/rest/v1/skill_gap?select=name,demand_rate,study_minutes&order=job_count.desc&limit=10",
        token,
    )
    logs = supabase(
        "GET",
        "/rest/v1/study_logs?select=minutes,note,studied_on,skills(name)&order=studied_on.desc&limit=10",
        token,
    )

    gap_lines = [
        f"- {g['name']}：求人の{g['demand_rate']}%に登場／学習{g['study_minutes']}分" for g in gaps
    ]
    log_lines = [
        f"- {l['studied_on']} {l['skills']['name'] if l.get('skills') else '?'} {l['minutes']}分：{l.get('note') or '（メモなし）'}"
        for l in logs
    ]

    result = ask_ai(
        system=(
            "あなたはIT企業の採用面接官です。未経験からエンジニアに転職しようとしている人に、"
            "面接の質問を1つだけ出してください。質問は日本語で、1〜2文にしてください。"
            "学習した内容について、「どんな課題があり、どう取り組み、なぜその方法を選び、何ができるようになったか」"
            "を話してもらえる質問にしてください。"
        ),
        prompt=(
            "【求人によく出るスキルと学習時間】\n"
            + ("\n".join(gap_lines) or "（まだデータがありません）")
            + "\n\n【最近の学習ログ】\n"
            + ("\n".join(log_lines) or "（まだデータがありません）")
        ),
        tool_name="interview_question",
        schema={
            "type": "object",
            "properties": {
                "question": {"type": "string", "description": "面接の質問"},
            },
            "required": ["question"],
        },
    )
    question = str(result.get("question", "")).strip()
    if not question:
        raise HttpError(502, "AIが質問を作れませんでした")

    # 保存。Prefer: return=representation で「保存した行」を返してもらう
    rows = supabase(
        "POST",
        "/rest/v1/interview_sessions?select=id,question",
        token,
        body={"question": question},
        prefer="return=representation",
    )
    return {"session_id": rows[0]["id"], "question": rows[0]["question"]}


# ---------------------------------------------------------------------
# ② 回答を採点する
# ---------------------------------------------------------------------
def grade_answer(token: str, session_id, answer) -> dict:
    if not isinstance(session_id, int):
        raise HttpError(400, "session_id が正しくありません")
    if not isinstance(answer, str) or not answer.strip():
        raise HttpError(400, "回答を入力してください")
    if len(answer) > MAX_ANSWER_LENGTH:
        raise HttpError(400, f"回答は{MAX_ANSWER_LENGTH}文字以内にしてください")

    # RLS が効いているので、他人の session_id を指定しても見つからない
    rows = supabase(
        "GET", f"/rest/v1/interview_sessions?select=question,answer&id=eq.{session_id}", token
    )
    if not rows:
        raise HttpError(404, "この質問が見つかりません")
    if rows[0]["answer"]:
        raise HttpError(409, "この質問にはもう回答済みです")

    result = ask_ai(
        system=(
            "あなたはIT企業の採用面接官です。転職希望者の回答を、"
            "「課題→手段→理由→成果」の4つの観点で採点してください。"
            "各観点は0〜25点、合計100点です。講評は日本語で、良かった点と、"
            "どう言い換えるともっと伝わるか（具体的な言い方の例）を含めてください。"
        ),
        prompt=f"【質問】\n{rows[0]['question']}\n\n【回答】\n{answer}",
        tool_name="interview_feedback",
        schema={
            "type": "object",
            "properties": {
                "problem": {"type": "integer", "description": "課題（0〜25点）"},
                "approach": {"type": "integer", "description": "手段（0〜25点）"},
                "reason": {"type": "integer", "description": "理由（0〜25点）"},
                "result": {"type": "integer", "description": "成果（0〜25点）"},
                "feedback": {"type": "string", "description": "講評"},
            },
            "required": ["problem", "approach", "reason", "result", "feedback"],
        },
    )

    # AI が範囲外の数字を返しても壊れないように、0〜25 に収める
    def clamp(v) -> int:
        try:
            return max(0, min(25, int(v)))
        except (TypeError, ValueError):
            return 0

    scores = {k: clamp(result.get(k)) for k in ("problem", "approach", "reason", "result")}
    total = sum(scores.values())
    feedback = str(result.get("feedback", "")).strip()

    supabase(
        "PATCH",
        f"/rest/v1/interview_sessions?id=eq.{session_id}",
        token,
        body={"answer": answer, "score": total, "feedback": feedback},
    )
    return {"score": total, "breakdown": scores, "feedback": feedback}


# ---------------------------------------------------------------------
# 入口（Lambda が最初に呼ぶ関数）
# ---------------------------------------------------------------------
def lambda_handler(event, context):
    try:
        if event.get("requestContext", {}).get("http", {}).get("method") != "POST":
            raise HttpError(405, "POST で呼んでください")

        # ログインの証明書を取り出す（関数 URL ではヘッダー名が小文字になる）
        auth = event.get("headers", {}).get("authorization", "")
        if not auth.startswith("Bearer "):
            raise HttpError(401, "ログインが必要です")
        token = auth.removeprefix("Bearer ")

        raw = event.get("body") or "{}"
        if event.get("isBase64Encoded"):  # 送られ方によっては暗号化ではなく「符号化」されて届く
            raw = base64.b64decode(raw).decode()
        try:
            body = json.loads(raw)
        except json.JSONDecodeError:
            raise HttpError(400, "送られてきたデータの形が正しくありません")

        action = body.get("action")
        if action == "question":
            return response(200, make_question(token))
        if action == "answer":
            return response(200, grade_answer(token, body.get("session_id"), body.get("answer")))
        raise HttpError(400, "action は question か answer を指定してください")

    except HttpError as e:
        return response(e.status, {"error": e.message})
    except Exception as e:  # 想定外のエラー。詳細はログ（CloudWatch）にだけ出す
        print(f"想定外のエラー: {type(e).__name__}: {e}")
        return response(500, {"error": "サーバーでエラーが起きました"})
