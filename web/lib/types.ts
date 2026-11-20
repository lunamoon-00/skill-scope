// データベースから受け取るデータの「形」をTypeScriptで書いておく。
// 形を決めておくと、列名の打ち間違いなどを書いている最中に気づける。

export type SkillRanking = {
  skill_id: number;
  name: string;
  job_count: number;
  required_count: number;
  required_rate: number;
};

export type SkillGap = {
  skill_id: number;
  name: string;
  job_count: number;
  demand_rate: number;
  study_minutes: number;
};

export type Requirement = "required" | "preferred";

export type JobPosting = {
  id: number;
  title: string;
  company: string | null;
  source_url: string | null;
  created_at: string;
  job_skills: { requirement: Requirement; skills: { name: string } | null }[];
};

export type Skill = { id: number; name: string };

export type InterviewSession = {
  id: number;
  question: string;
  answer: string | null;
  feedback: string | null;
  score: number | null;
  created_at: string;
};

export type StudyLog = {
  id: number;
  minutes: number;
  note: string | null;
  studied_on: string;
  skills: { name: string } | null;
};
