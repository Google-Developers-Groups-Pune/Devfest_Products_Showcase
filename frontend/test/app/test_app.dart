import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';

import 'package:prompt_heist/app/app.dart';
import 'package:prompt_heist/app/router.dart';

/// Pumps the app in its own [ProviderScope] and returns its router.
Future<GoRouter> pumpApp(WidgetTester tester) async {
  final container = ProviderContainer();
  addTearDown(container.dispose);
  await tester.pumpWidget(
    UncontrolledProviderScope(container: container, child: const PromptHeistApp()),
  );
  await tester.pumpAndSettle();
  return container.read(routerProvider);
}

/// Navigates to a deferred route and waits for its page.
///
/// A deferred page shows an endless spinner until its library loads, so
/// `pumpAndSettle` cannot be used. Fake time is advanced in steps instead.
///
/// On the test VM, a deferred library can be loaded in only ONE test per
/// file: the load is cached against the first test's fake-time zone and never
/// completes in later tests. So each deferred route gets its own test file.
/// Test feature screens by importing them directly, not through the router.
Future<void> goToDeferredRoute(WidgetTester tester, GoRouter router, String path, Finder expected) async {
  router.go(path);
  for (var i = 0; i < 100 && expected.evaluate().isEmpty; i++) {
    await tester.pump(const Duration(milliseconds: 50));
  }
  if (expected.evaluate().isEmpty) fail('Timed out waiting for $expected on $path');
}
