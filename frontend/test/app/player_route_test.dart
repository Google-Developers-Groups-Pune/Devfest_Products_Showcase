import 'package:flutter_test/flutter_test.dart';

import 'package:prompt_heist/app/router.dart';

import 'test_app.dart';

void main() {
  testWidgets('opens the player route by default', (tester) async {
    final router = await pumpApp(tester);
    expect(router.routerDelegate.currentConfiguration.uri.path, AppRoutes.player);
    expect(find.text('Player'), findsOneWidget);
  });

  testWidgets('bare domain redirects to the player route', (tester) async {
    final router = await pumpApp(tester);
    router.go('/');
    await tester.pumpAndSettle();
    expect(router.routerDelegate.currentConfiguration.uri.path, AppRoutes.player);
    expect(find.text('Player'), findsOneWidget);
  });
}
