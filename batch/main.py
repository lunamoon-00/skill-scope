"""
=====================================================================
Phase 4：週ごとのスキル出現数を集計するバッチ（まとめて処理するプログラム）

やること：
  ① Supabase から「求人」と「その求人のスキル」を全部取ってくる
  ② pandas（パンダス／表データを扱うライブラリ）で、
     「ユーザー × 週 × スキル」ごとに、何件の求人に出てきたかを数える
  ③ 結果を skill_trends テーブルに書き込む（毎回まるごと作り直す）

動かし方：
  環境変数 SUPABASE_URL と SUPABASE_SECRET_KEY を設定して
    python main.py

※ SUPABASE_SECRET_KEY は RLS を無視できる強いキー。
   このバッチは「全ユーザー分」を集計するので、強いキーが必要になる。
   画面（ブラウザ）には絶対に渡さない。サーバーの中だけで使う。
=====================================================================
"""

import os
import sys
from datetime import datetime

import pandas as pd
import requests
from dotenv import load_dotenv

# 同じフォルダに .env があれば読み込む（手元で動かすとき用。本番では使わない）
load_dotenv()

SUPABASE_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
SECRET_KEY = os.environ.get("SUPABASE_SECRET_KEY", "")

PAGE_SIZE = 1000  # 1回の問い合わせで取る件数（Supabase の上限に合わせる）
TIMEZONE = "Asia/Tokyo"  # 「週」は日本時間で区切る


def log(message: str) -> None:
    """ログを出す。Cloud Run ではここに出したものが「ログ」画面で見られる"""
    print(f"[{datetime.now().isoformat(timespec='seconds')}] {message}", flush=True)


def headers() -> dict:
    """Supabase の REST API を呼ぶときの共通ヘッダー"""
    return {"apikey": SECRET_KEY, "Content-Type": "application/json"}


# ---------------------------------------------------------------------
# ① データを取ってくる
# ---------------------------------------------------------------------
def fetch_job_skills() -> pd.DataFrame:
    """求人とスキルのつながりを、1行＝「1つの求人に出てきた1つのスキル」の表にして返す"""
    rows = []
    offset = 0
    while True:
        # job_postings に job_skills をつなげて取る（Phase 3 の画面と同じ書き方）
        res = requests.get(
            f"{SUPABASE_URL}/rest/v1/job_postings",
            headers=headers(),
            params={
                "select": "id,user_id,created_at,job_skills(skill_id)",
                "order": "id",
                "limit": PAGE_SIZE,
                "offset": offset,
            },
            timeout=30,
        )
        res.raise_for_status()  # エラー（4xx・5xx）なら、ここで止める
        page = res.json()

        for job in page:
            for js in job["job_skills"]:
                rows.append(
                    {
                        "user_id": job["user_id"],
                        "created_at": job["created_at"],
                        "skill_id": js["skill_id"],
                    }
                )

        if len(page) < PAGE_SIZE:  # 最後のページまで来たら終わり
            break
        offset += PAGE_SIZE

    return pd.DataFrame(rows, columns=["user_id", "created_at", "skill_id"])


# ---------------------------------------------------------------------
# ② 週ごとに集計する（ここが pandas の見せ場）
# ---------------------------------------------------------------------
def aggregate_weekly(df: pd.DataFrame) -> pd.DataFrame:
    if df.empty:
        return pd.DataFrame(columns=["user_id", "week", "skill_id", "job_count"])

    # 文字列の日時 → 日時型 → 日本時間に変換
    created = pd.to_datetime(df["created_at"], utc=True).dt.tz_convert(TIMEZONE)

    # その日が含まれる週の「月曜日」を求める
    #   dayofweek は 月曜=0, 火曜=1 … 日曜=6 なので、その日数だけさかのぼれば月曜になる
    monday = created.dt.normalize() - pd.to_timedelta(created.dt.dayofweek, unit="D")
    df = df.assign(week=monday.dt.strftime("%Y-%m-%d"))

    # 「ユーザー × 週 × スキル」でグループにまとめて、行数（＝求人の件数）を数える
    result = (
        df.groupby(["user_id", "week", "skill_id"])
        .size()
        .reset_index(name="job_count")
        .sort_values(["user_id", "week", "job_count"], ascending=[True, True, False])
    )
    return result


# ---------------------------------------------------------------------
# ③ skill_trends を作り直す
# ---------------------------------------------------------------------
def replace_trends(trends: pd.DataFrame) -> None:
    # まず全部消す（求人が削除された場合も、正しい数字に戻るように）
    # REST API は「条件なしの全件削除」を禁止しているので、必ず当てはまる条件を付ける
    res = requests.delete(
        f"{SUPABASE_URL}/rest/v1/skill_trends",
        headers=headers(),
        params={"week": "gte.1900-01-01"},
        timeout=30,
    )
    res.raise_for_status()

    if trends.empty:
        return

    # 1000件ずつに分けて書き込む
    records = trends.to_dict(orient="records")
    for i in range(0, len(records), PAGE_SIZE):
        chunk = records[i : i + PAGE_SIZE]
        # pandas の数値型（numpy.int64）は JSON にできないので、普通の int に直す
        for r in chunk:
            r["skill_id"] = int(r["skill_id"])
            r["job_count"] = int(r["job_count"])
        res = requests.post(
            f"{SUPABASE_URL}/rest/v1/skill_trends",
            headers=headers(),
            json=chunk,
            timeout=30,
        )
        res.raise_for_status()


# ---------------------------------------------------------------------
# メインの処理
# ---------------------------------------------------------------------
def main() -> int:
    if not SUPABASE_URL or not SECRET_KEY:
        log("エラー：環境変数 SUPABASE_URL と SUPABASE_SECRET_KEY を設定してください")
        return 1

    log(f"集計を開始します（接続先：{SUPABASE_URL}）")

    job_skills = fetch_job_skills()
    log(f"求人のスキル {len(job_skills)} 件を読み込みました")

    trends = aggregate_weekly(job_skills)
    log(f"「ユーザー × 週 × スキル」の組み合わせ {len(trends)} 件に集計しました")

    replace_trends(trends)
    log("skill_trends を更新しました。完了です")
    return 0


if __name__ == "__main__":
    # 終了コード：0＝成功、それ以外＝失敗。Cloud Run はこれを見て成功・失敗を判断する
    sys.exit(main())
