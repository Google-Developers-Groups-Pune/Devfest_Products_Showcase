import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';

import 'package:prompt_heist/app/app.dart';
import 'package:prompt_heist/app/router.dart';
import 'package:prompt_heist/core/api/token_store.dart';
import 'package:prompt_heist/core/mock/mock_world.dart';

/// Navigation that used to run from build() now runs from listeners.
/// These drive the real pages against the in-app mock.
void main() {
  Future<GoRouter> pumpAsPlayer(WidgetTester tester) async {
    // The test font draws every glyph as a wide square, so some phone rows
    // overflow here though they fit on a phone. Only navigation is tested.
    final onError = FlutterError.onError;
    FlutterError.onError = (details) {
      if (details.exceptionAsString().contains('overflowed')) return;
      onError?.call(details);
    };
    addTearDown(() => FlutterError.onError = onError);
    MockWorld.reset();
    final c = ProviderContainer();
    addTearDown(c.dispose);
    c.read(tokenProvider.notifier).set('mock_player_token');
    await tester.pumpWidget(
      UncontrolledProviderScope(container: c, child: const PromptHeistApp()),
    );
    await tester.pump();
    return c.read(routerProvider);
  }

  String path(GoRouter r) => r.routerDelegate.currentConfiguration.uri.path;

  Future<void> waitFor(WidgetTester tester, bool Function() done) async {
    for (var i = 0; i < 200 && !done(); i++) {
      await tester.pump(const Duration(milliseconds: 100));
    }
  }

  testWidgets('the lobby moves to the battle when the round starts', (
    tester,
  ) async {
    final router = await pumpAsPlayer(tester);
    router.go(AppRoutes.playerLobby);
    // The mock lobby script fills the lobby and starts the round at 14 s.
    await waitFor(tester, () => path(router) == AppRoutes.playerBattle);
    expect(path(router), AppRoutes.playerBattle);
    MockWorld.reset(); // cancels the mock's 90 s round timer
  });

  testWidgets('a result that is not confirmed goes back to time up', (
    tester,
  ) async {
    final router = await pumpAsPlayer(tester);
    router.go(AppRoutes.playerResult);
    await waitFor(tester, () => path(router) == AppRoutes.playerTimeUp);
    expect(path(router), AppRoutes.playerTimeUp);
  });
}
