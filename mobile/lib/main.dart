// =====================================================================
// SkillScope モバイル（Phase 6）
//   スマホから「学習ログ」を記録するアプリ。
//   Web版と同じ Supabase につながるので、ここで記録した内容は
//   Web のダッシュボードにもそのまま反映される。
//
// 起動のしかた（接続先は外から渡す。コードには書かない）：
//   dart_defines.example.json をコピーして dart_defines.json を作り、値を入れてから
//   flutter run -d chrome --dart-define-from-file=dart_defines.json
//
// 画面の流れ：
//   ログインしていない → LoginPage
//   ログインしている   → StudyLogPage（記録の一覧と、追加ボタン）
// =====================================================================
import 'package:material_ui/material_ui.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

// --dart-define で渡された値を読む（Web版の環境変数と同じ考え方）
const supabaseUrl = String.fromEnvironment('SUPABASE_URL');
const supabaseKey = String.fromEnvironment('SUPABASE_PUBLISHABLE_KEY');

Future<void> main() async {
  // Flutter の準備ができるのを待ってから、Supabase につなぐ
  WidgetsFlutterBinding.ensureInitialized();
  if (supabaseUrl.isEmpty || supabaseKey.isEmpty) {
    runApp(const _ConfigErrorApp());
    return;
  }
  await Supabase.initialize(url: supabaseUrl, publishableKey: supabaseKey);
  runApp(const SkillScopeApp());
}

// どこからでも使える Supabase の窓口
SupabaseClient get supabase => Supabase.instance.client;

// ---------------------------------------------------------------------
// アプリ全体（色・フォントなどの見た目と、最初の画面を決める）
// ---------------------------------------------------------------------
class SkillScopeApp extends StatelessWidget {
  const SkillScopeApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'SkillScope',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        colorSchemeSeed: Colors.indigo, // Web版と同じ藍色（インディゴ）
        useMaterial3: true,
      ),
      // ログイン状態が変わるたびに、表示する画面を自動で切り替える
      home: StreamBuilder<AuthState>(
        stream: supabase.auth.onAuthStateChange,
        builder: (context, _) {
          final session = supabase.auth.currentSession;
          return session == null ? const LoginPage() : const StudyLogPage();
        },
      ),
    );
  }
}

// 接続先の設定を忘れたときに出す画面
class _ConfigErrorApp extends StatelessWidget {
  const _ConfigErrorApp();

  @override
  Widget build(BuildContext context) {
    return const MaterialApp(
      home: Scaffold(
        body: Center(
          child: Padding(
            padding: EdgeInsets.all(24),
            child: Text(
              '接続先が設定されていません。\n'
              '--dart-define で SUPABASE_URL と SUPABASE_PUBLISHABLE_KEY を渡してください。',
            ),
          ),
        ),
      ),
    );
  }
}

// ---------------------------------------------------------------------
// ログイン画面
// ---------------------------------------------------------------------
class LoginPage extends StatefulWidget {
  const LoginPage({super.key});

  @override
  State<LoginPage> createState() => _LoginPageState();
}

class _LoginPageState extends State<LoginPage> {
  final _email = TextEditingController();
  final _password = TextEditingController();
  bool _pending = false;
  String? _error;

  Future<void> _login() async {
    setState(() {
      _pending = true;
      _error = null;
    });
    try {
      await supabase.auth.signInWithPassword(
        email: _email.text.trim(),
        password: _password.text,
      );
      // 成功したら onAuthStateChange が気づいて、自動で一覧画面に切り替わる
    } on AuthException catch (e) {
      // Web版と同じく、パスワード違いとそれ以外を分けて表示する
      setState(() => _error = e.code == 'invalid_credentials'
          ? 'メールアドレスかパスワードが違います'
          : 'ログインできませんでした（${e.message}）');
    } finally {
      if (mounted) setState(() => _pending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 400),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(
                  'SkillScope',
                  textAlign: TextAlign.center,
                  style: Theme.of(context).textTheme.headlineMedium?.copyWith(fontWeight: FontWeight.w900),
                ),
                const SizedBox(height: 4),
                const Text('学習ログをスマホから記録', textAlign: TextAlign.center),
                const SizedBox(height: 32),
                TextField(
                  controller: _email,
                  keyboardType: TextInputType.emailAddress,
                  decoration: const InputDecoration(labelText: 'メールアドレス', border: OutlineInputBorder()),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: _password,
                  obscureText: true, // 入力を ●●● で隠す
                  decoration: const InputDecoration(labelText: 'パスワード', border: OutlineInputBorder()),
                  onSubmitted: (_) => _login(),
                ),
                if (_error != null) ...[
                  const SizedBox(height: 12),
                  Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
                ],
                const SizedBox(height: 20),
                FilledButton(
                  onPressed: _pending ? null : _login,
                  child: Text(_pending ? 'ログイン中…' : 'ログイン'),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

// ---------------------------------------------------------------------
// 学習ログの一覧画面
// ---------------------------------------------------------------------
class StudyLog {
  StudyLog({required this.id, required this.minutes, required this.studiedOn, this.note, this.skillName});

  final int id;
  final int minutes;
  final String studiedOn;
  final String? note;
  final String? skillName;

  // Supabase から届いた JSON（Map）を、Dart のクラスに変換する
  factory StudyLog.fromJson(Map<String, dynamic> json) => StudyLog(
        id: json['id'] as int,
        minutes: json['minutes'] as int,
        studiedOn: json['studied_on'] as String,
        note: json['note'] as String?,
        skillName: (json['skills'] as Map<String, dynamic>?)?['name'] as String?,
      );
}

class StudyLogPage extends StatefulWidget {
  const StudyLogPage({super.key});

  @override
  State<StudyLogPage> createState() => _StudyLogPageState();
}

class _StudyLogPageState extends State<StudyLogPage> {
  late Future<List<StudyLog>> _logs = _fetchLogs();

  // Web版と同じ問い合わせ。RLS があるので、自分の記録だけが返ってくる
  Future<List<StudyLog>> _fetchLogs() async {
    final rows = await supabase
        .from('study_logs')
        .select('id, minutes, note, studied_on, skills(name)')
        .order('studied_on', ascending: false)
        .order('id', ascending: false)
        .limit(50);
    return rows.map(StudyLog.fromJson).toList();
  }

  void _reload() => setState(() => _logs = _fetchLogs());

  Future<void> _openAddSheet() async {
    final added = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true, // キーボードが出ても隠れないように
      builder: (_) => const AddStudyLogSheet(),
    );
    if (added == true) _reload();
  }

  Future<void> _delete(StudyLog log) async {
    await supabase.from('study_logs').delete().eq('id', log.id);
    _reload();
  }

  @override
  Widget build(BuildContext context) {
    final email = supabase.auth.currentUser?.email ?? '';
    return Scaffold(
      appBar: AppBar(
        title: const Text('学習ログ'),
        actions: [
          IconButton(
            tooltip: 'ログアウト（$email）',
            icon: const Icon(Icons.logout),
            onPressed: () => supabase.auth.signOut(),
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _openAddSheet,
        icon: const Icon(Icons.add),
        label: const Text('記録する'),
      ),
      body: RefreshIndicator(
        onRefresh: () async => _reload(), // 下に引っぱると読み込み直す
        child: FutureBuilder<List<StudyLog>>(
          future: _logs,
          builder: (context, snapshot) {
            if (snapshot.connectionState != ConnectionState.done) {
              return const Center(child: CircularProgressIndicator());
            }
            if (snapshot.hasError) {
              return ListView(children: const [
                Padding(padding: EdgeInsets.all(24), child: Text('読み込みに失敗しました')),
              ]);
            }
            final logs = snapshot.data!;
            if (logs.isEmpty) {
              return ListView(children: const [
                Padding(padding: EdgeInsets.all(24), child: Text('まだ記録がありません。右下のボタンから記録しましょう。')),
              ]);
            }
            final total = logs.fold<int>(0, (sum, l) => sum + l.minutes);
            return ListView(
              padding: const EdgeInsets.only(bottom: 96),
              children: [
                ListTile(
                  title: Text('最近の合計：${_formatMinutes(total)}',
                      style: const TextStyle(fontWeight: FontWeight.bold)),
                ),
                const Divider(height: 1),
                for (final log in logs)
                  // 左にスワイプすると削除できる
                  Dismissible(
                    key: ValueKey(log.id),
                    direction: DismissDirection.endToStart,
                    background: Container(
                      color: Theme.of(context).colorScheme.errorContainer,
                      alignment: Alignment.centerRight,
                      padding: const EdgeInsets.only(right: 24),
                      child: const Icon(Icons.delete),
                    ),
                    onDismissed: (_) => _delete(log),
                    child: ListTile(
                      title: Text(log.skillName ?? '?'),
                      subtitle: log.note == null ? null : Text(log.note!),
                      trailing: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        crossAxisAlignment: CrossAxisAlignment.end,
                        children: [
                          Text(_formatMinutes(log.minutes), style: const TextStyle(fontWeight: FontWeight.bold)),
                          Text(log.studiedOn, style: Theme.of(context).textTheme.bodySmall),
                        ],
                      ),
                    ),
                  ),
              ],
            );
          },
        ),
      ),
    );
  }
}

// 90 → 「1時間30分」
String _formatMinutes(int minutes) {
  final h = minutes ~/ 60;
  final m = minutes % 60;
  if (h == 0) return '$m分';
  return m == 0 ? '$h時間' : '$h時間$m分';
}

// ---------------------------------------------------------------------
// 記録を追加する画面（下からせり上がってくるシート）
// ---------------------------------------------------------------------
class AddStudyLogSheet extends StatefulWidget {
  const AddStudyLogSheet({super.key});

  @override
  State<AddStudyLogSheet> createState() => _AddStudyLogSheetState();
}

class _AddStudyLogSheetState extends State<AddStudyLogSheet> {
  // スキルの選択肢（求人の分析で登録されたもの）
  final Future<List<Map<String, dynamic>>> _skills =
      supabase.from('skills').select('id, name').order('name');

  int? _skillId;
  int _minutes = 60;
  final _note = TextEditingController();
  bool _pending = false;
  String? _error;

  Future<void> _save() async {
    if (_skillId == null) {
      setState(() => _error = 'スキルを選んでください');
      return;
    }
    setState(() {
      _pending = true;
      _error = null;
    });
    try {
      // user_id は書かなくてよい（DB 側で、ログイン中のユーザーが自動で入る）
      await supabase.from('study_logs').insert({
        'skill_id': _skillId,
        'minutes': _minutes,
        'studied_on': DateTime.now().toIso8601String().substring(0, 10), // 「2026-11-21」の形
        'note': _note.text.trim().isEmpty ? null : _note.text.trim(),
      });
      if (mounted) Navigator.pop(context, true); // 閉じて「追加した」と伝える
    } catch (_) {
      setState(() {
        _error = '記録に失敗しました';
        _pending = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      // キーボードの高さぶん、上に持ち上げる
      padding: EdgeInsets.fromLTRB(24, 24, 24, 24 + MediaQuery.of(context).viewInsets.bottom),
      child: FutureBuilder<List<Map<String, dynamic>>>(
        future: _skills,
        builder: (context, snapshot) {
          if (!snapshot.hasData) {
            return const SizedBox(height: 120, child: Center(child: CircularProgressIndicator()));
          }
          final skills = snapshot.data!;
          return Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text('今日の学習を記録', style: Theme.of(context).textTheme.titleLarge),
              const SizedBox(height: 16),
              DropdownButtonFormField<int>(
                initialValue: _skillId,
                decoration: const InputDecoration(labelText: 'スキル', border: OutlineInputBorder()),
                items: [
                  for (final s in skills)
                    DropdownMenuItem(value: s['id'] as int, child: Text(s['name'] as String)),
                ],
                onChanged: (v) => setState(() => _skillId = v),
              ),
              const SizedBox(height: 16),
              Text('時間：${_formatMinutes(_minutes)}'),
              // 15分きざみのスライダー（スマホでは数字を打つより楽）
              Slider(
                value: _minutes.toDouble(),
                min: 15,
                max: 480,
                divisions: (480 - 15) ~/ 15,
                label: _formatMinutes(_minutes),
                onChanged: (v) => setState(() => _minutes = v.round()),
              ),
              TextField(
                controller: _note,
                decoration: const InputDecoration(labelText: 'メモ（任意）', border: OutlineInputBorder()),
              ),
              if (_error != null) ...[
                const SizedBox(height: 12),
                Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
              ],
              const SizedBox(height: 20),
              FilledButton(
                onPressed: _pending ? null : _save,
                child: Text(_pending ? '記録中…' : '記録する'),
              ),
            ],
          );
        },
      ),
    );
  }
}
