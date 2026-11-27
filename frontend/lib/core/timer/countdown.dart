import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../realtime/game_socket.dart';
import '../realtime/socket_providers.dart';
import 'countdown_math.dart';

class CountdownState {
  const CountdownState({
    this.active = false,
    this.remaining = Duration.zero,
    this.reconnecting = false,
  });
  final bool active;
  final Duration remaining;
  final bool reconnecting;

  String get label => formatCountdown(remaining);
  bool get expired => active && remaining == Duration.zero;

  @override
  bool operator ==(Object other) =>
      other is CountdownState &&
      other.active == active &&
      other.reconnecting == reconnecting &&
      other.label == label;

  @override
  int get hashCode => Object.hash(active, reconnecting, label);
}

/// Server-synced countdown fed by `timer:sync` and `round:started` on one
/// socket. Display only: it never decides whether a submission is allowed.
abstract class SyncedCountdown extends Notifier<CountdownState> {
  // timer:sync arrives every 3 seconds. Two missed ones means trouble.
  static const _staleAfter = Duration(seconds: 7);

  DateTime? _roundEndAt;
  DateTime? _serverNow;
  DateTime? _receivedAt;

  @override
  CountdownState build() {
    final sub = watchSocket().messages.listen(_onMessage);
    final ticker = Timer.periodic(
      const Duration(milliseconds: 250),
      (_) => _tick(),
    );
    ref.onDispose(() {
      sub.cancel();
      ticker.cancel();
    });
    return const CountdownState();
  }

  /// The socket whose timer events drive this countdown.
  GameSocket watchSocket();

  void _onMessage(SocketMessage m) {
    if (m.event != 'timer:sync' && m.event != 'round:started') return;
    final d = m.data;
    if (d is! Map) return;
    seed(roundEndAt: d['roundEndAt'], serverNow: d['serverNow']);
  }

  /// Also called with the hydrate data (`roundEndAt` and `serverNow`).
  void seed({required Object? roundEndAt, required Object? serverNow}) {
    final end = DateTime.tryParse('$roundEndAt');
    final srv = DateTime.tryParse('$serverNow');
    if (end == null || srv == null) return;
    _roundEndAt = end;
    _serverNow = srv;
    _receivedAt = DateTime.now();
    _tick();
  }

  void _tick() {
    final end = _roundEndAt, srv = _serverNow, rec = _receivedAt;
    if (end == null || srv == null || rec == null) return;
    final now = DateTime.now();
    final left = remainingFor(
      roundEndAt: end,
      serverNow: srv,
      receivedAt: rec,
      now: now,
    );
    state = CountdownState(
      active: true,
      remaining: left,
      // After 00:00 the server stops syncing, so that is not "reconnecting".
      reconnecting: left > Duration.zero && now.difference(rec) > _staleAfter,
    );
  }
}

class CountdownNotifier extends SyncedCountdown {
  @override
  GameSocket watchSocket() => ref.watch(playerSocketProvider);
}

class DisplayCountdownNotifier extends SyncedCountdown {
  @override
  GameSocket watchSocket() => ref.watch(displaySocketProvider);
}

/// Player phone countdown.
final countdownProvider = NotifierProvider<CountdownNotifier, CountdownState>(
  CountdownNotifier.new,
);

/// Audience screen countdown.
final displayCountdownProvider =
    NotifierProvider<DisplayCountdownNotifier, CountdownState>(
      DisplayCountdownNotifier.new,
    );
