-- =====================================================================
-- Phase 2-1：スキル名を受け取って、スキルの番号（id）を返す関数
--
-- AIが返したスキル名のリスト（例：['TypeScript', 'aws']）を渡すと、
--   ・すでに skills にあるものは、その id を返す
--   ・まだないものは、新しく登録してから id を返す
-- 「なければ作る、あれば使う」なので、upsert（アップサート）と呼ばれる処理。
--
-- Edge Function（サーバー側）からだけ呼ぶ。ログインユーザーが直接は呼べないようにする。
-- =====================================================================

create function public.get_or_create_skill_ids(p_names text[])
returns table (id bigint, name text)
language sql
set search_path = ''   -- 関数の中で別のスキーマの同名テーブルを誤って使わないための安全設定
as $$
  -- ① まだないスキルを登録する
  --    on conflict ((lower(name))) do nothing
  --    …… 小文字にした名前がすでにあれば（TypeScript と typescript など）、何もしない
  insert into public.skills (name)
  select distinct on (lower(trim(n))) trim(n)
  from unnest(p_names) as n          -- 配列を1行ずつに展開する
  where trim(n) <> ''
  on conflict ((lower(name))) do nothing;

  -- ② 渡された名前に対応する id を返す（大文字・小文字の違いは無視）
  select s.id, s.name
  from public.skills s
  where lower(s.name) in (select lower(trim(n)) from unnest(p_names) as n);
$$;

-- 誰でも呼べる状態をやめて、サーバー用の強い権限（service_role）だけに許可する
revoke execute on function public.get_or_create_skill_ids(text[]) from public, anon, authenticated;
grant  execute on function public.get_or_create_skill_ids(text[]) to service_role;
