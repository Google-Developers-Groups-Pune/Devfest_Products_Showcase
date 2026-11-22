import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../features/audience/audience_shell.dart' deferred as audience;
import '../features/controller/controller_shell.dart' deferred as controller;
import '../features/player/player_shell.dart';
import 'deferred_page.dart';

/// Route paths from the shared contract (D9).
abstract final class AppRoutes {
  static const String player = '/player';
  static const String controller = '/controller';
  static const String audience = '/audience';
}

/// One router per [ProviderScope], so tests get a fresh one and guards
/// (FE-11) can read other providers through `ref`.
final routerProvider = Provider<GoRouter>((ref) {
  final router = GoRouter(
    initialLocation: AppRoutes.player,
    routes: [
      // The bare domain opens the player route (D24).
      GoRoute(path: '/', redirect: (_, _) => AppRoutes.player),
      GoRoute(
        path: AppRoutes.player,
        builder: (_, _) => const PlayerShell(),
      ),
      GoRoute(
        path: AppRoutes.controller,
        builder: (_, _) => DeferredPage(
          loadLibrary: controller.loadLibrary,
          builder: (_) => controller.ControllerShell(),
        ),
      ),
      GoRoute(
        path: AppRoutes.audience,
        builder: (_, _) => DeferredPage(
          loadLibrary: audience.loadLibrary,
          builder: (_) => audience.AudienceShell(),
        ),
      ),
    ],
  );
  ref.onDispose(router.dispose);
  return router;
});
