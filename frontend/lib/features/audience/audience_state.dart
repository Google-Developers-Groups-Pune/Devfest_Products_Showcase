import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/realtime/game_socket.dart';
import '../../core/realtime/socket_providers.dart';
import '../../core/timer/countdown.dart';
import '../../core/wake/wake_lock.dart';
import '../../core/json.dart';
import '../../core/theme/slot_shape.dart';
export '../../core/json.dart';


/// Slot shapes are fixed by slot number (shared contract).
/// One player as the public screen may see it. Never a full name or ID.
class AudiencePlayer {
  const AudiencePlayer({
    required this.slotNumber,
    required this.label,
    required this.shape,
    this.connection = 'CONNECTED',
    this.state = 'LOBBY',
    this.bestScore,
    this.text,
    this.reaction,
    this.expression,
    this.feedCount = 0,
  });

  final int slotNumber;
  final String label;
  final String shape;
  final String connection;
  final String state;
  final int? bestScore;

  /// Latest approved prompt, its reaction and the face to show.
  final String? text;
  final String? reaction;
  final String? expression;

  /// Goes up with every feed:update, so the face replays its animation even
  /// when two prompts in a row get the same expression.
  final int feedCount;

  bool get unlocked => state == 'LOCKED_100';
  bool get disconnected => connection == 'DISCONNECTED';

  factory AudiencePlayer.fromJson(Json j) {
    final slot = (j['slotNumber'] as num?)?.toInt() ?? 0;
    final latest = j['latest'];
    return AudiencePlayer(
      slotNumber: slot,
      label: '${j['label'] ?? 'Player $slot'}',
      shape: '${j['shape'] ?? SlotShape.forSlot(slot < 1 ? 1 : slot).apiValue}',
      connection: '${j['connection'] ?? 'CONNECTED'}',
      state: '${j['state'] ?? 'LOBBY'}',
      bestScore: (j['bestScore'] as num?)?.toInt(),
      text: latest is Map ? latest['text'] as String? : null,
      reaction: latest is Map ? latest['reaction'] as String? : null,
      expression: latest is Map ? latest['expression'] as String? : null,
    );
  }

  AudiencePlayer copyWith({
    String? connection,
    String? state,
    int? bestScore,
    String? text,
    String? reaction,
    String? expression,
    int? feedCount,
    bool clearLatest = false,
  }) => AudiencePlayer(
    slotNumber: slotNumber,
    label: label,
    shape: shape,
    connection: connection ?? this.connection,
    state: state ?? this.state,
    bestScore: clearLatest ? bestScore : (bestScore ?? this.bestScore),
    text: clearLatest ? null : (text ?? this.text),
    // A failed reaction is null on purpose (decision D49), so take it as sent.
    reaction: clearLatest ? null : (text != null ? reaction : this.reaction),
    expression: clearLatest ? null : (expression ?? this.expression),
    feedCount: feedCount ?? this.feedCount,
  );
}

class AudienceTreasure {
  const AudienceTreasure({
    required this.title,
    required this.lockObjective,
    required this.backstory,
    required this.imageUrl,
  });

  final String title;
  final String lockObjective;
  final String backstory;
  final String imageUrl;

  factory AudienceTreasure.fromJson(Json j) => AudienceTreasure(
    title: '${j['title'] ?? ''}',
    lockObjective: '${j['lockObjective'] ?? ''}',
    backstory: '${j['backstory'] ?? ''}',
    imageUrl: '${j['imageUrl'] ?? ''}',
  );
}

class AudienceState {
  const AudienceState({
    this.ready = false,
    this.connected = true,
    this.phase = 'SETUP',
    this.joinUrl = '',
    this.capacity = 5,
    this.joinedCount = 0,
    this.players = const [],
    this.treasure,
    this.unlocked = const [],
    this.result,
  });

  /// First hydrate has arrived.
  final bool ready;

  /// Socket connected and the last hydrate worked.
  final bool connected;

  final String phase;
  final String joinUrl;
  final int capacity;
  final int joinedCount;

  /// Empty until players:revealed, so no name ever appears one by one (D16).
  final List<AudiencePlayer> players;

  /// Only set once the round starts, so an unapproved treasure never shows.
  final AudienceTreasure? treasure;

  /// Labels in unlock order, for the banner.
  final List<String> unlocked;

  /// Public result: provisional in RESULT_PENDING, full in RESULTS (FE-23).
  final Json? result;

  bool get revealed => players.isNotEmpty;

  AudienceState copyWith({
    bool? ready,
    bool? connected,
    String? phase,
    String? joinUrl,
    int? capacity,
    int? joinedCount,
    List<AudiencePlayer>? players,
    AudienceTreasure? treasure,
    bool clearTreasure = false,
    List<String>? unlocked,
    Json? result,
    bool clearResult = false,
  }) => AudienceState(
    ready: ready ?? this.ready,
    connected: connected ?? this.connected,
    phase: phase ?? this.phase,
    joinUrl: joinUrl ?? this.joinUrl,
    capacity: capacity ?? this.capacity,
    joinedCount: joinedCount ?? this.joinedCount,
    players: players ?? this.players,
    treasure: clearTreasure ? null : (treasure ?? this.treasure),
    unlocked: unlocked ?? this.unlocked,
    result: clearResult ? null : (result ?? this.result),
  );

  /// From `GET /api/display/state`.
  factory AudienceState.fromHydrate(Json d) {
    final session = d['session'];
    final t = d['treasure'];
    final r = d['result'];
    return AudienceState(
      ready: true,
      phase: '${d['phase'] ?? 'SETUP'}',
      joinUrl: '${d['joinUrl'] ?? ''}',
      capacity: session is Map ? (session['capacity'] as num?)?.toInt() ?? 5 : 5,
      joinedCount: session is Map
          ? (session['joinedCount'] as num?)?.toInt() ?? 0
          : 0,
      players: _players(d['players']),
      treasure: t is Map ? AudienceTreasure.fromJson(Json.from(t)) : null,
      unlocked: [for (final u in (d['unlocked'] as List?) ?? const []) '$u'],
      result: r is Map ? Json.from(r) : null,
    );
  }

  /// Applies one socket event. Unknown events leave the state unchanged.
  AudienceState apply(String event, Object? data) {
    if (data is! Map) return this;
    final d = Json.from(data);
    switch (event) {
      case 'phase:changed':
        return copyWith(phase: '${d['phase']}');

      case 'session:opened':
        // A fresh group: back to joining with nothing from the last game.
        return AudienceState(
          ready: true,
          connected: connected,
          phase: 'JOINING',
          joinUrl: joinUrl,
          capacity: (d['capacity'] as num?)?.toInt() ?? capacity,
        );

      case 'player:joined':
        // Counts only. Any names in the payload are ignored until the reveal.
        return copyWith(
          joinedCount: (d['joinedCount'] as num?)?.toInt(),
          capacity: (d['capacity'] as num?)?.toInt(),
        );

      case 'players:revealed':
        final list = _players(d['players']);
        return copyWith(players: list, joinedCount: list.length);

      case 'player:connection':
        return _update(
          d['slotNumber'],
          (p) => p.copyWith(connection: '${d['connection']}'),
        );

      case 'round:started':
        final t = d['treasure'];
        return copyWith(
          phase: 'PLAYING',
          treasure: t is Map ? AudienceTreasure.fromJson(Json.from(t)) : null,
          clearTreasure: t is! Map,
          unlocked: const [],
          clearResult: true,
          players: [
            for (final p in players)
              p.copyWith(state: 'PLAYING', clearLatest: true),
          ],
        );

      case 'feed:update':
        final slot = (d['slotNumber'] as num?)?.toInt();
        var next = this;
        if (slot != null && !players.any((p) => p.slotNumber == slot)) {
          // Should not happen after the reveal, but never drop a feed row.
          next = copyWith(
            players: [
              ...players,
              AudiencePlayer.fromJson({...d, 'state': 'PLAYING'}),
            ],
          );
        }
        return next._update(
          slot,
          (p) => p.copyWith(
            bestScore: (d['bestScore'] as num?)?.toInt(),
            text: '${d['text'] ?? ''}',
            reaction: d['reaction'] as String?,
            expression: '${d['expression'] ?? 'NEUTRAL'}',
            feedCount: p.feedCount + 1,
          ),
        );

      case 'player:unlocked':
        final list = (d['unlocked'] as List?) ?? [d['label']];
        return _update(
          d['slotNumber'],
          (p) => p.copyWith(state: 'LOCKED_100', bestScore: 100),
        ).copyWith(unlocked: [for (final u in list) '$u']);

      case 'round:ended':
        return copyWith(phase: 'RESULT_PENDING');

      case 'result:provisional':
        // Winner and score only, shown as pending (D22).
        return copyWith(
          phase: 'RESULT_PENDING',
          result: {'status': 'PROVISIONAL', 'winner': d['winner']},
        );

      case 'result:confirmed':
        return copyWith(phase: 'RESULTS', result: d);

      case 'round:discarded':
        return copyWith(phase: 'DISCARDED');

      case 'session:closed':
        return copyWith(phase: 'CLOSED');
    }
    return this;
  }

  AudienceState _update(
    Object? slot,
    AudiencePlayer Function(AudiencePlayer) change,
  ) {
    final n = slot is num ? slot.toInt() : int.tryParse('$slot');
    return copyWith(
      players: [
        for (final p in players) p.slotNumber == n ? change(p) : p,
      ],
    );
  }

  static List<AudiencePlayer> _players(Object? raw) => [
    for (final p in (raw as List?) ?? const [])
      if (p is Map) AudiencePlayer.fromJson(Json.from(p)),
  ]..sort((a, b) => a.slotNumber.compareTo(b.slotNumber));
}

/// Rows for the battle view: best score first, then slot number.
List<AudiencePlayer> rankedRows(List<AudiencePlayer> players) =>
    List.of(players)..sort((a, b) {
      final c = (b.bestScore ?? -1).compareTo(a.bestScore ?? -1);
      return c != 0 ? c : a.slotNumber.compareTo(b.slotNumber);
    });

/// The FE-22 banner text.
String unlockBanner(List<String> unlocked) =>
    '${unlocked.join(', ')} unlocked the treasure! '
    'The winner is still decided when the timer hits 00:00.';

class AudienceNotifier extends Notifier<AudienceState> {
  Timer? _retry;

  @override
  AudienceState build() {
    keepScreenAwake();

    final socket = ref.watch(displaySocketProvider);
    final sub = socket.messages.listen(
      (m) => state = state.apply(m.event, m.data),
    );
    final statusSub = socket.status.listen(
      (s) => state = state.copyWith(connected: s == SocketStatus.connected),
    );

    // If the hydrate call fails, try again until it works.
    ref.listen(displayStateProvider, (prev, next) {
      if (next.hasError && !next.isLoading) {
        state = state.copyWith(connected: false);
        _retry?.cancel();
        _retry = Timer(
          const Duration(seconds: 3),
          () => ref.invalidate(displayStateProvider),
        );
      }
    });

    ref.onDispose(() {
      sub.cancel();
      statusSub.cancel();
      _retry?.cancel();
    });

    // Rebuilds from the server every time the hydrate call is refreshed,
    // which happens after every socket connect and reconnect.
    final hydrate = ref.watch(displayStateProvider).value;
    if (hydrate == null) return const AudienceState();

    final round = hydrate['round'];
    if (round is Map) {
      Future.microtask(() {
        if (!ref.mounted) return;
        ref
            .read(displayCountdownProvider.notifier)
            .seed(roundEndAt: round['roundEndAt'], serverNow: hydrate['serverNow']);
      });
    }
    return AudienceState.fromHydrate(hydrate).copyWith(
      connected: socket.currentStatus == SocketStatus.connected,
    );
  }
}

final audienceProvider = NotifierProvider<AudienceNotifier, AudienceState>(
  AudienceNotifier.new,
);
