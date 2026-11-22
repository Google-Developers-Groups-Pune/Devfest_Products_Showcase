import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/api_error.dart';
import '../api/player_api.dart';
import '../api/token_store.dart';
import 'game_socket.dart';

/// Hydrate data for the player. Refetched after every socket reconnect.
final meProvider = FutureProvider<Json>((ref) {
  ref.watch(tokenProvider);
  return ref.watch(playerApiProvider).me();
});

final playerSocketProvider = Provider<GameSocket>((ref) {
  final token = ref.watch(tokenProvider);
  final socket = GameSocket(
    namespace: '/player',
    token: token,
    onHydrate: () async => ref.invalidate(meProvider),
  );
  socket.connect();
  ref.onDispose(socket.dispose);
  return socket;
});

final socketStatusProvider = StreamProvider<SocketStatus>(
  (ref) => ref.watch(playerSocketProvider).status,
);

String errorText(Object e) => e is ApiException ? e.code : e.toString();

/// Hydrate data for the audience screen (GET /api/display/state).
/// Refetched after every socket reconnect.
final displayStateProvider = FutureProvider<Json>(
  (ref) => ref.watch(displayApiProvider).state(),
);

/// The public `/display` namespace. Needs no token.
final displaySocketProvider = Provider<GameSocket>((ref) {
  final socket = GameSocket(
    namespace: '/display',
    onHydrate: () async => ref.invalidate(displayStateProvider),
  );
  socket.connect();
  ref.onDispose(socket.dispose);
  return socket;
});

final displaySocketStatusProvider = StreamProvider<SocketStatus>(
  (ref) => ref.watch(displaySocketProvider).status,
);
