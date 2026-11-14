# SkillScope

求人票をAIで分析して「市場で求められているスキル」を見える化し、自分の学習ログと比べて足りないスキルを見つけ、面接の練習までできるシステムです。

> 🚧 開発中（2026年11月〜）。進み具合は下の「開発状況」に記録しています。

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
- [ ] Phase 1：データベース設計（テーブル・集計ビュー）
- [ ] Phase 2：求人分析API（Edge Function）
- [ ] Phase 3：Webアプリの画面
- [ ] Phase 4：週次集計バッチ（Python / Docker / Cloud Run）
- [ ] Phase 5：面接コーチ（AWS Lambda / Bedrock）
- [ ] Phase 6：スマホアプリ（Flutter）
- [ ] Phase 7：仕上げ

## 秘密情報の扱い

APIキーなどは `.env` にだけ書き、Gitには入れません。必要な設定項目は [.env.example](.env.example) にまとめています。
