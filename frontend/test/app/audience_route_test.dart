import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:material_ui/material_ui.dart';

import 'package:prompt_heist/app/router.dart';

import 'test_app.dart';

// One deferred route per file. See goToDeferredRoute.
void main() {
  testWidgets('audience route loads its deferred code', (tester) async {
    final router = await pumpApp(tester);
    await goToDeferredRoute(tester, router, AppRoutes.audience, find.text('Prompt Heist'));
    expect(find.text('Prompt Heist'), findsOneWidget);

    // The audience screen re-hydrates on a periodic timer. Stop it before the
    // test ends, or the test fails with a pending timer.
    final container = ProviderScope.containerOf(tester.element(find.text('Prompt Heist')));
    await tester.pumpWidget(const SizedBox());
    container.dispose();
  });
}
