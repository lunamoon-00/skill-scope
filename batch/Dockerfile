# =====================================================================
# Dockerfile（ドッカーファイル）：コンテナの「設計図」
# 上から順に実行されて、プログラムを動かすための箱（イメージ）ができる
# =====================================================================

# ① 土台：Python が入った軽量な Linux
FROM python:3.13-slim

# ② ログがすぐ表示されるようにする設定
ENV PYTHONUNBUFFERED=1

# ③ 箱の中の作業フォルダ
WORKDIR /app

# ④ 先にライブラリだけ入れる
#   requirements.txt が変わらない限り、ここは前回の結果（キャッシュ）が使い回されて速くなる
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# ⑤ プログラム本体をコピー
COPY main.py .

# ⑥ 箱を起動したときに実行するコマンド
CMD ["python", "main.py"]
