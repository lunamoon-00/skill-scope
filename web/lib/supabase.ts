// =====================================================================
// Supabase につなぐための「窓口」を1つだけ作って、アプリ全体で使い回す
//
// NEXT_PUBLIC_ で始まる環境変数は、ブラウザに渡されるコードにも埋め込まれる。
// ここに入れていいのは「公開してもいいキー（Publishable key）」だけ。
// 公開キーでも、RLS（行単位のアクセス制限）があるので他人のデータは読めない。
// =====================================================================
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!url || !key) {
  throw new Error(
    "NEXT_PUBLIC_SUPABASE_URL と NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY を web/.env.local に設定してください",
  );
}

export const supabase = createClient(url, key);
