import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../features/audience/audience_shell.dart' deferred as audience;
import '../features/controller/controller_shell.dart' deferred as controller;
import '../features/gallery/gallery_page.dart' deferred as gallery;
import '../features/player/battle/battle_page.dart';
import '../features/player/finish/cancelled_page.dart';
import '../features/player/finish/result_page.dart';
import '../features/player/finish/timeup_page.dart';
import '../features/player/join/booth_code_page.dart';
import '../features/player/join/kicked_page.dart';
import '../features/player/join/name_id_page.dart';
import '../features/player/join/rejoin_page.dart';
import '../features/player/lobby/lobby_page.dart';
import '../core/theme/heist_theme.dart';
import 'deferred_page.dart';

/// Route paths from the shared contract (D9).
abstract final class AppRoutes {
  static const String player = '/player';
  static const String controller = '/controller';
  static const String audience = '/audience';

  // Player flow (FE-05 to FE-10).
  static const String playerJoin = '/player/join';
  static const String playerRejoin = '/player/rejoin';
  static const String playerKicked = '/player/kicked';
  static const String playerLobby = '/player/lobby';
  static const String playerBattle = '/player/battle';
  static const String playerTimeUp = '/player/timeup';
  static const String playerResult = '/player/result';
  static const String playerCancelled = '/player/cancelled';

  /// Widget gallery for design review (FE-26). Deferred, so phones never load it.
  static const String gallery = '/gallery';
}

/// One router per [ProviderScope], so tests get a fresh one and guards
/// (FE-11) can read other providers through `ref`.
final routerProvider = Provider<GoRouter>((ref) {
  final router = GoRouter(
    initialLocation: AppRoutes.player,
    routes: [
      // The bare domain opens the player route (D24).
      GoRoute(path: '/', redirect: (_, _) => AppRoutes.player),
      GoRoute(path: AppRoutes.player, builder: (_, _) => const BoothCodePage()),
      GoRoute(path: AppRoutes.playerJoin, builder: (_, _) => const NameIdPage()),
      GoRoute(path: AppRoutes.playerRejoin, builder: (_, _) => const RejoinPage()),
      GoRoute(path: AppRoutes.playerKicked, builder: (_, _) => const KickedPage()),
      GoRoute(path: AppRoutes.playerLobby, builder: (_, _) => const LobbyPage()),
      GoRoute(path: AppRoutes.playerBattle, builder: (_, _) => const BattlePage()),
      GoRoute(path: AppRoutes.playerTimeUp, builder: (_, _) => const TimeUpPage()),
      GoRoute(path: AppRoutes.playerResult, builder: (_, _) => const ResultPage()),
      GoRoute(path: AppRoutes.playerCancelled, builder: (_, _) => const CancelledPage()),
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
      GoRoute(
        path: AppRoutes.gallery,
        builder: (_, _) => DeferredPage(
          loadLibrary: gallery.loadLibrary,
          builder: (_) => HeistThemeScope(child: gallery.GalleryPage()),
        ),
      ),
    ],
  );
  ref.onDispose(router.dispose);
  return router;
});
