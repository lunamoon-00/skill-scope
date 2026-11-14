-- =====================================================================
-- Phase 1-1：テーブルを作る
-- マイグレーション（データベースの変更履歴）の1本目。
-- このファイルを上から順に実行すると、空のDBにテーブルがそろう。
-- =====================================================================


-- ---------------------------------------------------------------------
-- skills：スキルの名簿（全ユーザー共通）
-- 「TypeScript」「typescript」が別物にならないよう、小文字にした名前で重複を禁止する。
-- ---------------------------------------------------------------------
create table public.skills (
  id         bigint generated always as identity primary key,  -- 自動で 1, 2, 3... と番号が振られる
  name       text not null,
  created_at timestamptz not null default now()
);

create unique index skills_name_lower_key on public.skills (lower(name));


-- ---------------------------------------------------------------------
-- job_postings：登録した求人票
-- user_id は Supabase のログイン機能（auth.users）のユーザーとつなぐ。
-- default auth.uid() …… ログイン中の人のIDが自動で入る。
-- on delete cascade …… ユーザーが削除されたら、その人の求人もまとめて消える。
-- ---------------------------------------------------------------------
create table public.job_postings (
  id         bigint generated always as identity primary key,
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  company    text,
  title      text not null,
  source_url text,
  raw_text   text not null check (char_length(raw_text) <= 20000),  -- AIに渡す文字数の上限（課金対策）
  created_at timestamptz not null default now()
);

create index job_postings_user_id_idx on public.job_postings (user_id);


-- ---------------------------------------------------------------------
-- job_skills：「どの求人に、どのスキルが、必須か歓迎か」
-- 求人とスキルは「多対多」（1つの求人に複数スキル、1つのスキルが複数求人に登場）なので、
-- 間をつなぐテーブルを置く。これを「中間テーブル」と呼ぶ。
-- ---------------------------------------------------------------------
create type public.requirement_level as enum ('required', 'preferred');  -- 必須 / 歓迎 の2択だけ許す

create table public.job_skills (
  job_id      bigint not null references public.job_postings (id) on delete cascade,
  skill_id    bigint not null references public.skills (id) on delete restrict,  -- 使われているスキルは消せない
  requirement public.requirement_level not null,
  primary key (job_id, skill_id)  -- 同じ求人に同じスキルを2回登録できない
);

create index job_skills_skill_id_idx on public.job_skills (skill_id);


-- ---------------------------------------------------------------------
-- study_logs：学習ログ
-- ---------------------------------------------------------------------
create table public.study_logs (
  id         bigint generated always as identity primary key,
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  skill_id   bigint not null references public.skills (id) on delete restrict,
  minutes    int not null check (minutes > 0 and minutes <= 1440),  -- 1日は1440分
  note       text,
  studied_on date not null default current_date,
  created_at timestamptz not null default now()
);

create index study_logs_user_skill_idx on public.study_logs (user_id, skill_id);


-- ---------------------------------------------------------------------
-- interview_sessions：面接練習の記録（Phase 5 で使う）
-- ---------------------------------------------------------------------
create table public.interview_sessions (
  id         bigint generated always as identity primary key,
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  question   text not null,
  answer     text,
  feedback   text,
  score      int check (score between 0 and 100),
  created_at timestamptz not null default now()
);

create index interview_sessions_user_id_idx on public.interview_sessions (user_id);


-- ---------------------------------------------------------------------
-- skill_trends：週ごとのスキル出現数（Phase 4 の Python バッチが書き込む）
-- ---------------------------------------------------------------------
create table public.skill_trends (
  user_id   uuid not null references auth.users (id) on delete cascade,
  week      date not null,  -- その週の月曜日の日付
  skill_id  bigint not null references public.skills (id) on delete cascade,
  job_count int not null,
  primary key (user_id, week, skill_id)
);


-- =====================================================================
-- RLS（Row Level Security／行単位のアクセス制限）
-- 「自分のデータしか見えない・変えられない」をDB側で保証する仕組み。
-- 画面のコードにバグがあっても、他人のデータは返ってこない。
-- (select auth.uid()) と select で包むのは、行ごとに毎回計算させないための定番の書き方。
-- =====================================================================
alter table public.skills             enable row level security;
alter table public.job_postings       enable row level security;
alter table public.job_skills         enable row level security;
alter table public.study_logs         enable row level security;
alter table public.interview_sessions enable row level security;
alter table public.skill_trends       enable row level security;

-- skills：ログインしている人は誰でも読める。追加はサーバー側（Edge Function）だけが行う。
create policy "ログインユーザーはスキルを読める"
  on public.skills for select
  to authenticated
  using (true);

-- 自分のデータだけ、読み書きできる（求人・学習ログ・面接記録）
create policy "自分の求人だけ操作できる"
  on public.job_postings for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "自分の学習ログだけ操作できる"
  on public.study_logs for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "自分の面接記録だけ操作できる"
  on public.interview_sessions for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- job_skills は user_id を持たないので、「つながっている求人が自分のものか」で判定する
create policy "自分の求人のスキルだけ操作できる"
  on public.job_skills for all
  to authenticated
  using (
    exists (
      select 1 from public.job_postings jp
      where jp.id = job_id and jp.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.job_postings jp
      where jp.id = job_id and jp.user_id = (select auth.uid())
    )
  );

-- skill_trends：読むだけ。書き込みはバッチ（強い権限のキー）が行う。
create policy "自分のトレンドだけ読める"
  on public.skill_trends for select
  to authenticated
  using ((select auth.uid()) = user_id);
