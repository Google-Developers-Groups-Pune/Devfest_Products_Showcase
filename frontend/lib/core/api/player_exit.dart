import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'token_store.dart';

/// Why this phone must stop being a player (FE-07, FE-10).
enum PlayerExit {
  /// The player rejoined on another device: show the kicked screen.
  kicked,

  /// The session closed or the token is no longer valid: clear the phone
  /// and go back to the booth code screen.
  cleared,
}

/// The exit for a 401 code from the player REST routes or a refused
/// `/player` socket. Null for codes that do not end the session.
PlayerExit? playerExitFor(String code) => switch (code) {
  'TOKEN_SUPERSEDED' => PlayerExit.kicked,
  'SESSION_CLOSED' || 'UNAUTHENTICATED' => PlayerExit.cleared,
  _ => null,
};

/// Set once, from any screen, when the player's session ends. The app
/// listens and navigates, so no page has to handle it on its own.
class PlayerExitNotifier extends Notifier<PlayerExit?> {
  @override
  PlayerExit? build() {
    // A new token (or none) starts clean.
    ref.watch(tokenProvider);
    return null;
  }

  /// `player:kicked` arrived on this device's socket.
  void kicked() => state ??= PlayerExit.kicked;

  /// Reports an error code. Codes that do not end the session are ignored.
  void report(String code) {
    final exit = playerExitFor(code);
    if (exit != null) state ??= exit;
  }
}

final playerExitProvider = NotifierProvider<PlayerExitNotifier, PlayerExit?>(
  PlayerExitNotifier.new,
);
