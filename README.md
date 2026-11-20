# SkillScope

求人票をAIで分析して「市場で求められているスキル」を見える化し、自分の学習ログと比べて足りないスキルを見つけ、面接の練習までできるシステムです。

> 🚧 開発中（2026年11月〜）。進み具合は下の「開発状況」に記録しています。

**デモ：** https://skill-scope-delta.vercel.app/

## なぜ作るのか

| | |
|---|---|
| **課題** | 転職活動で「何を学べば採用に近づくか」が、求人を読んだときの感覚でしか分からない |
| **手段** | 求人票をAIで構造化してDBに貯め、SQLで集計する。学習ログと比べて不足スキルを出し、AIが面接官役で質問する |
| **理由** | 求人票は文章なので、そのままでは集計できない。AIでスキル単位に分解すれば数字で比べられる |
| **成果** | 完成後に記入予定 |

## 構成

| 部品 | 技術 |
|---|---|
| Webアプリ | Next.js / TypeScript / Vercel |
| データベース | Supabase（PostgreSQL） |
| 求人分析 | Supabase Edge Functions（TypeScript）＋ AI API |
| 週次集計バッチ | Python / Docker / Google Cloud Run Jobs |
| 面接コーチ | AWS Lambda / Amazon Bedrock |
| スマホアプリ（予定） | Flutter |

詳しい設計は [docs/design.md](docs/design.md) を見てください。

## 開発状況

- [x] Phase 0：リポジトリ準備
- [x] Phase 1：データベース設計（テーブル・集計ビュー・RLS）
- [x] Phase 2：求人分析API（Edge Function ＋ Gemini、Supabaseクラウドに公開）
- [x] Phase 3：Webアプリの画面（Next.js、Vercelで公開）
- [x] Phase 4：週次集計バッチ（Python・pandas / Docker / Cloud Run Jobs、毎週月曜9時に Cloud Scheduler で自動実行。キーは Secret Manager で管理）
- [ ] Phase 5：面接コーチ（AWS Lambda / Bedrock）
- [ ] Phase 6：スマホアプリ（Flutter）
- [ ] Phase 7：仕上げ

## ローカルで動かす

必要なもの：Node.js、Docker Desktop

```bash
npm install
npm run db:start   # Docker上でSupabaseを起動（テーブル作成と試しデータの投入まで自動）
npm run db:reset   # DBを作り直す
npm run db:stop    # 停止
```

DBの中身は Supabase Studio（http://127.0.0.1:54323）で見られます。

## データベースの工夫

- **RLS（行単位のアクセス制限）**：「自分のデータしか見えない・変えられない」をDB側で保証。画面側のコードにバグがあっても他人のデータは返らない
- **集計はSQLのビューで**：`skill_ranking`（スキルの登場数・必須率）、`skill_gap`（需要が高いのに学習時間が少ないスキル）
- **スキル名の重複防止**：`TypeScript` と `typescript` を同じものとして扱う

## 秘密情報の扱い

APIキーなどは `.env` にだけ書き、Gitには入れません。必要な設定項目は [.env.example](.env.example) にまとめています。
