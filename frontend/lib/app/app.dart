import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:material_ui/material_ui.dart';

import '../core/api/player_exit.dart';
import '../core/api/token_store.dart';
import '../core/storage/player_session.dart';
import '../core/widgets/app_background.dart';
import '../features/player/battle/game_state.dart';
import 'router.dart';

class PromptHeistApp extends ConsumerWidget {
  const PromptHeistApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final router = ref.watch(routerProvider);

    // A 401, a refused socket or player:kicked on any player screen ends
    // the session there (FE-07, FE-10).
    ref.listen<PlayerExit?>(playerExitProvider, (prev, exit) {
      if (exit == null) return;
      forgetPlayerToken();
      ref.read(tokenProvider.notifier).set(null);
      router.go(
        exit == PlayerExit.kicked ? AppRoutes.playerKicked : AppRoutes.player,
      );
    });

    // The session phase decides the screen. This also keeps game state alive
    // from the lobby onward, so it catches every event.
    ref.listen<String>(gameProvider.select((g) => g.phase), (prev, phase) {
      switch (phase) {
        case 'RESULT_PENDING':
          router.go(AppRoutes.playerTimeUp);
        case 'RESULTS':
          router.go(AppRoutes.playerResult);
        case 'DISCARDED':
          router.go(AppRoutes.playerCancelled);
        case 'CLOSED':
          // Session over: clear this phone, back to the booth code screen.
          forgetPlayerToken();
          ref.read(tokenProvider.notifier).set(null);
          router.go(AppRoutes.player);
      }
    });

    return MaterialApp.router(
      title: 'Prompt Heist',
      debugShowCheckedModeBanner: false,
      routerConfig: router,
      theme: ThemeData(
        useMaterial3: true,
        fontFamily: 'AppSans',
        fontFamilyFallback: const ['AppEmoji'],
        // Pages show the shared background behind them.
        scaffoldBackgroundColor: Colors.transparent,
      ),
      builder: (context, child) =>
          AppBackground(child: child ?? const SizedBox()),
    );
  }
}
