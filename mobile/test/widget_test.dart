// ログイン画面が表示されるかのテスト（Supabase にはつながずに確認できる部分だけ）
import 'package:material_ui/material_ui.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:skill_scope_mobile/main.dart';

void main() {
  testWidgets('ログイン画面に入力欄とボタンが出る', (tester) async {
    await tester.pumpWidget(const MaterialApp(home: LoginPage()));

    expect(find.text('メールアドレス'), findsOneWidget);
    expect(find.text('パスワード'), findsOneWidget);
    expect(find.widgetWithText(FilledButton, 'ログイン'), findsOneWidget);
  });
}
