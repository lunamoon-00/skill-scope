-- =====================================================================
-- Phase 1-2：集計ビューを作る
-- ビュー＝「名前を付けて保存したSELECT文」。テーブルのように select * from で呼べる。
-- security_invoker = true …… ビューを呼んだ人の権限（RLS）で中身を絞る。
--   これがないと、ビュー経由で他人のデータまで見えてしまう。
-- =====================================================================


-- ---------------------------------------------------------------------
-- skill_ranking：スキルごとの「登場した求人数」と「必須にされた割合」
-- ---------------------------------------------------------------------
create view public.skill_ranking
with (security_invoker = true) as
select
  s.id   as skill_id,
  s.name,
  count(*)                                              as job_count,       -- 何件の求人に出てきたか
  count(*) filter (where js.requirement = 'required')   as required_count,  -- そのうち必須だった件数
  round(
    100.0 * count(*) filter (where js.requirement = 'required') / count(*),
    1
  )                                                     as required_rate    -- 必須率（%）
from public.job_skills js
join public.job_postings jp on jp.id = js.job_id   -- RLSで「自分の求人」だけに絞るためにつなぐ
join public.skills s       on s.id  = js.skill_id
group by s.id, s.name;


-- ---------------------------------------------------------------------
-- skill_gap：「求人によく出るのに、まだあまり勉強していないスキル」
-- WITH 句（CTE）で、①需要 ②学習時間 ③求人の総数 を別々に計算してから合体させる。
-- ---------------------------------------------------------------------
create view public.skill_gap
with (security_invoker = true) as
with demand as (          -- ① スキルごとの登場回数
  select js.skill_id, count(*) as job_count
  from public.job_skills js
  join public.job_postings jp on jp.id = js.job_id
  group by js.skill_id
),
study as (                -- ② スキルごとの学習時間の合計
  select skill_id, sum(minutes) as study_minutes
  from public.study_logs
  group by skill_id
),
total as (                -- ③ 求人の総数
  select count(*) as total_jobs
  from public.job_postings
)
select
  s.id                                                   as skill_id,
  s.name,
  d.job_count,
  round(100.0 * d.job_count / nullif(t.total_jobs, 0), 1) as demand_rate,    -- 求人のうち何%に出てくるか
  coalesce(st.study_minutes, 0)                           as study_minutes   -- 未学習なら 0
from demand d
join public.skills s on s.id = d.skill_id
cross join total t
left join study st on st.skill_id = d.skill_id;   -- 学習ゼロのスキルも残したいので LEFT JOIN
