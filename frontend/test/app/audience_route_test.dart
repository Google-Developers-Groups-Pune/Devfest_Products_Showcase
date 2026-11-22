import 'package:flutter_test/flutter_test.dart';

import 'package:prompt_heist/app/router.dart';

import 'test_app.dart';

// One deferred route per file. See goToDeferredRoute.
void main() {
  testWidgets('audience route loads its deferred code', (tester) async {
    final router = await pumpApp(tester);
    await goToDeferredRoute(tester, router, AppRoutes.audience, find.text('Audience'));
    expect(find.text('Audience'), findsOneWidget);
  });
}
