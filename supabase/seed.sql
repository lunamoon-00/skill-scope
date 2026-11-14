-- =====================================================================
-- 試しのデータ（ローカル開発専用）
-- `npm run db:reset` のたびに、テーブルを作り直したあとこのファイルが実行される。
-- 本番のDBには入れない。
-- =====================================================================

-- テスト用ユーザー（ローカル専用。メール: test@example.com / パスワード: password123）
insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data,
  -- ログイン機能はこれらの列が NULL だとエラーになるため、空文字を入れておく
  confirmation_token, recovery_token, email_change_token_new, email_change
) values (
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'test@example.com',
  extensions.crypt('password123', extensions.gen_salt('bf')),
  now(), now(), now(),
  '{"provider":"email","providers":["email"]}', '{}',
  '', '', '', ''
);

-- メールアドレスでログインするための「本人確認情報」
insert into auth.identities (
  provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
) values (
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000001',
  '{"sub":"00000000-0000-0000-0000-000000000001","email":"test@example.com","email_verified":true}',
  'email', now(), now(), now()
);

insert into public.skills (name) values
  ('TypeScript'), ('Python'), ('AWS'), ('SQL'), ('Docker'),
  ('React'), ('Next.js'), ('Google Cloud'), ('Git'), ('Flutter');

-- 求人5件（中身は架空）
insert into public.job_postings (user_id, company, title, raw_text) values
  ('00000000-0000-0000-0000-000000000001', 'A社', 'Webエンジニア',      '（架空）TypeScript・Reactでの開発経験。AWS経験歓迎。'),
  ('00000000-0000-0000-0000-000000000001', 'B社', 'バックエンドエンジニア', '（架空）Python・SQL必須。Docker・AWS歓迎。'),
  ('00000000-0000-0000-0000-000000000001', 'C社', 'フルスタックエンジニア', '（架空）TypeScript・Next.js・SQL必須。Google Cloud歓迎。'),
  ('00000000-0000-0000-0000-000000000001', 'D社', 'AIエンジニア',       '（架空）Python・AWS必須。Docker歓迎。'),
  ('00000000-0000-0000-0000-000000000001', 'E社', 'モバイルエンジニア',   '（架空）Flutter必須。Git・TypeScript歓迎。');

-- 求人とスキルのつながり（名前で探して入れる）
insert into public.job_skills (job_id, skill_id, requirement)
select jp.id, s.id, v.requirement::public.requirement_level
from (values
  ('A社', 'TypeScript',   'required'),
  ('A社', 'React',        'required'),
  ('A社', 'AWS',          'preferred'),
  ('B社', 'Python',       'required'),
  ('B社', 'SQL',          'required'),
  ('B社', 'Docker',       'preferred'),
  ('B社', 'AWS',          'preferred'),
  ('C社', 'TypeScript',   'required'),
  ('C社', 'Next.js',      'required'),
  ('C社', 'SQL',          'required'),
  ('C社', 'Google Cloud', 'preferred'),
  ('D社', 'Python',       'required'),
  ('D社', 'AWS',          'required'),
  ('D社', 'Docker',       'preferred'),
  ('E社', 'Flutter',      'required'),
  ('E社', 'Git',          'preferred'),
  ('E社', 'TypeScript',   'preferred')
) as v(company, skill, requirement)
join public.job_postings jp on jp.company = v.company
join public.skills s        on s.name    = v.skill;

-- 学習ログ
insert into public.study_logs (user_id, skill_id, minutes, note, studied_on)
select '00000000-0000-0000-0000-000000000001', s.id, v.minutes, v.note, v.studied_on::date
from (values
  ('Python',       180, 'Cloud Runのコードを読んだ',     '2026-11-10'),
  ('Python',       120, 'pandasの基本',                 '2026-11-11'),
  ('Google Cloud',  90, 'Cloud Runにデプロイ',           '2026-11-12'),
  ('SQL',           30, 'SELECT と WHERE',              '2026-11-13')
) as v(skill, minutes, note, studied_on)
join public.skills s on s.name = v.skill;
