# SkillScope

求人票をAIで分析して「市場で求められているスキル」を見える化し、自分の学習ログと比べて足りないスキルを見つけ、面接の練習までできるシステムです。

**デモ：** https://skill-scope-delta.vercel.app/
（ログインが必要です。お試し用アカウントは応募書類に記載しています）

## なぜ作ったのか

| | |
|---|---|
| **課題** | 転職活動で「何を学べば採用に近づくか」が、求人を読んだときの感覚でしか分からない。学んだことを面接でうまく説明できない |
| **手段** | 求人票をAIで構造化してDBに貯め、SQLで集計する。学習ログと比べて不足スキルを出し、AIが面接官役で質問・採点する |
| **理由** | 求人票は文章なので、そのままでは集計できない。AIでスキル単位に分解すれば数字で比べられる。説明の練習は「課題→手段→理由→成果」の型で採点すると、改善点がはっきりする |
| **成果** | 求人 ◯件を分析し、◯種類のスキルを抽出。「求人の◯%に出るのに未学習」のスキルが分かり、学習の優先順位を数字で決められた |

## できること

| 画面 | 内容 |
|---|---|
| ダッシュボード | よく求められるスキルのランキングと、「需要が高いのに学習が足りないスキル」 |
| 求人 | 求人票を貼り付けると、AI（Gemini）がスキル名と「必須／歓迎」に分解して保存 |
| 学習ログ | どのスキルを何分勉強したかを記録 |
| 面接練習 | 学習ログをもとにAI（Amazon Bedrock）が質問し、回答を「課題→手段→理由→成果」で100点満点で採点 |
| スマホアプリ | 学習ログの記録をスマホから（Flutter） |

## 構成

```mermaid
flowchart LR
  U[ブラウザ<br/>Next.js on Vercel] -->|ログイン・読み書き<br/>RLSで本人のデータだけ| DB[(Supabase<br/>PostgreSQL)]
  M[スマホアプリ<br/>Flutter] --> DB
  U -->|求人票| EF[Edge Function<br/>analyze-job<br/>TypeScript]
  EF --> G[Gemini API]
  EF --> DB
  U -->|ログインの証明書つき| L[AWS Lambda<br/>interview-coach<br/>Python]
  L --> BR[Amazon Bedrock<br/>Nova Lite]
  L --> DB
  S[Cloud Scheduler<br/>毎週月曜9時] --> CR[Cloud Run Job<br/>Python + Docker<br/>週次トレンド集計]
  CR --> DB
```

| 部品 | 技術 | 置き場所 |
|---|---|---|
| Webアプリ | Next.js 16 / TypeScript / Tailwind CSS | Vercel |
| データベース・認証 | Supabase（PostgreSQL・RLS） | Supabase（東京） |
| 求人分析API | Supabase Edge Functions（Deno / TypeScript）＋ Gemini | Supabase |
| 週次集計バッチ | Python（pandas）/ Docker | Google Cloud Run Jobs ＋ Cloud Scheduler ＋ Secret Manager |
| 面接コーチAPI | Python / boto3 | AWS Lambda（関数URL）＋ Amazon Bedrock |
| スマホアプリ | Flutter / Dart（supabase_flutter） | 手元（Chrome・Android） |

詳しい設計は [docs/design.md](docs/design.md) を見てください。

## 設計で工夫したこと

### セキュリティ
- **RLS（行単位のアクセス制限）**：「自分のデータしか見えない・変えられない」をDB側で保証。画面側のコードにバグがあっても、他人のデータは返らない
- **強い鍵をブラウザに置かない**：ブラウザには公開してよい鍵（Publishable key）だけ。全ユーザー分を集計するバッチだけが強い鍵（Secret key）を使い、それも Google Cloud の Secret Manager に保管
- **AWSに強い鍵を置かない**：Lambda は、画面から届いた「ログインの証明書」でSupabaseに問い合わせるので、RLSがそのまま効く。Bedrock を呼ぶ権限は IAM ロールで与え、プログラムにアクセスキーを書かない
- **AIを勝手に使わせない**：ログインの証明書が無い呼び出しは、AIを呼ぶ前に断る（料金の発生を防ぐ）。CORS でこのサイト以外からの呼び出しも断る

### データ
- **集計はSQLのビューで**：`skill_ranking`（スキルの登場数・必須率）、`skill_gap`（需要が高いのに学習時間が少ないスキル）。`security_invoker` で、ビュー経由でもRLSが効く
- **スキル名の重複防止**：`TypeScript` と `typescript` を同じものとして扱う（`lower(name)` のユニークインデックス）
- **AIの出力を決まった形にする**：Gemini は `responseSchema`、Bedrock はツール指定で、必ず決まった形のJSONで返させる

### コスト
- サーバーを常に動かさない構成（Vercel・Edge Functions・Cloud Run Jobs・Lambda）で、使った分だけ課金。個人利用ならほぼ無料枠に収まる
- 予算アラートを設定し、使いすぎに気づけるようにしている

## 開発中に解決したトラブル

| 起きたこと | 原因 | 解決 |
|---|---|---|
| 本番サイトでログインできない（画面には「パスワードが違います」） | 本番の環境変数に、手元用の鍵が入っていた | 実際の通信を確認して `Invalid API key` を特定。エラーの種類ごとに表示を分けるよう修正 |
| 面接練習で「Failed to fetch」 | Lambda の CORS の許可ヘッダーが、2つではなく1つの文字列で登録されていた | プリフライト（事前確認）の通信を直接送って、許可が返っていないことを確認し、設定を修正 |
| Dockerの中から手元のDBにつながらない | コンテナの中の `127.0.0.1` はコンテナ自身を指す | `host.docker.internal` で接続 |

## 開発状況

- [x] Phase 0：リポジトリ準備
- [x] Phase 1：データベース設計（テーブル・集計ビュー・RLS）
- [x] Phase 2：求人分析API（Edge Function ＋ Gemini、Supabaseクラウドに公開）
- [x] Phase 3：Webアプリの画面（Next.js、Vercelで公開）
- [x] Phase 4：週次集計バッチ（Python・pandas / Docker / Cloud Run Jobs、毎週月曜9時に Cloud Scheduler で自動実行。キーは Secret Manager で管理）
- [x] Phase 5：面接コーチ（AWS Lambda ＋ 関数URL ＋ Amazon Bedrock）※Bedrock は新規アカウントの利用開始待ち
- [x] Phase 6：スマホアプリ（Flutter、学習ログの記録。Web版と同じSupabase・RLSを利用）
- [ ] Phase 7：仕上げ（README・構成図・成果の数字）

## ローカルで動かす

必要なもの：Node.js、Docker Desktop

```bash
npm install
npm run db:start   # Docker上でSupabaseを起動（テーブル作成と試しデータの投入まで自動）
npm run db:reset   # DBを作り直す
npm run db:stop    # 停止
```

DBの中身は Supabase Studio（http://127.0.0.1:54323）で見られます。

**Webアプリ**
```bash
cd web
npm install
npm run dev        # http://localhost:3000（試しデータのユーザー：test@example.com / password123）
```

**スマホアプリ**（Flutter。Chrome で動かせます）
```bash
cd mobile
copy dart_defines.example.json dart_defines.json   # 接続先を書き込む
flutter run -d chrome --dart-define-from-file=dart_defines.json
```

**週次集計バッチ**
```bash
cd batch
docker build -t skill-trends .
docker run --rm --env-file .env -e SUPABASE_URL=http://host.docker.internal:54321 skill-trends
```

## 秘密情報の扱い

APIキーなどは `.env` にだけ書き、Gitには入れません。必要な設定項目は [.env.example](.env.example) と [batch/.env.example](batch/.env.example) にまとめています。クラウドでは、それぞれのサービスの環境変数・Secret Manager で管理しています。
