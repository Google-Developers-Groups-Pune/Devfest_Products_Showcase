import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/env.dart';
import '../../core/api/api_error.dart';
import '../../core/download/download.dart';
import '../../core/mock/mock_backend.dart';
import '../../core/realtime/game_socket.dart';
import 'controller_api.dart';
import 'controller_auth.dart';

int? _int(Object? v) => v is num ? v.toInt() : int.tryParse('${v ?? ''}');
String? _str(Object? v) => v == null ? null : '$v';
DateTime? _time(Object? v) => v == null ? null : DateTime.tryParse('$v');
Json _map(Object? v) => v is Map ? Map<String, dynamic>.from(v) : <String, dynamic>{};
List<Json> _list(Object? v) => [for (final e in (v as List?) ?? const []) if (e is Map) Map<String, dynamic>.from(e)];

// ---------------------------------------------------------------- models

class CtlPlayer {
  const CtlPlayer({
    required this.id,
    required this.label,
    required this.fullName,
    required this.entranceId,
    this.connection = 'CONNECTED',
    this.bestScore,
    this.nameReview = 'PENDING',
  });

  final String id;
  final String label;
  final String fullName;
  final String entranceId;
  final String connection;
  final int? bestScore;
  final String nameReview;

  bool get nameApproved => nameReview == 'APPROVED';
  bool get connected => connection == 'CONNECTED';

  factory CtlPlayer.fromJson(Json j) => CtlPlayer(
    id: '${j['id'] ?? ''}',
    label: '${j['label'] ?? ''}',
    fullName: '${j['fullName'] ?? ''}',
    entranceId: '${j['entranceId'] ?? ''}',
    connection: '${j['connection'] ?? 'CONNECTED'}',
    bestScore: _int(j['bestScore']),
    nameReview: '${j['nameReview'] ?? 'PENDING'}',
  );

  CtlPlayer copyWith({String? connection, int? bestScore, String? label, String? fullName, String? nameReview}) =>
      CtlPlayer(
        id: id,
        label: label ?? this.label,
        fullName: fullName ?? this.fullName,
        entranceId: entranceId,
        connection: connection ?? this.connection,
        bestScore: bestScore ?? this.bestScore,
        nameReview: nameReview ?? this.nameReview,
      );
}

class CtlSlot {
  const CtlSlot({required this.slotNumber, required this.code, required this.shape, required this.slotState, this.player});

  final int slotNumber;
  final String code;
  final String shape;

  /// UNJOINED, LOBBY, PLAYING, LOCKED_100, DISCONNECTED, RESULT_PENDING, COMPLETE.
  final String slotState;
  final CtlPlayer? player;

  bool get joined => player != null;

  factory CtlSlot.fromJson(Json j) {
    final p = j['player'];
    return CtlSlot(
      slotNumber: _int(j['slotNumber']) ?? 0,
      code: '${j['code'] ?? ''}',
      shape: '${j['shape'] ?? 'BLUE_CIRCLE'}',
      slotState: '${j['slotState'] ?? 'UNJOINED'}',
      player: p is Map ? CtlPlayer.fromJson(Map<String, dynamic>.from(p)) : null,
    );
  }

  CtlSlot copyWith({String? slotState, CtlPlayer? player}) => CtlSlot(
    slotNumber: slotNumber,
    code: code,
    shape: shape,
    slotState: slotState ?? this.slotState,
    player: player ?? this.player,
  );
}

class CtlSession {
  const CtlSession({
    required this.id,
    required this.phase,
    required this.capacity,
    required this.roundDurationSeconds,
    required this.joinedCount,
  });

  final String id;
  final String phase;
  final int capacity;
  final int roundDurationSeconds;
  final int joinedCount;

  factory CtlSession.fromJson(Json j) => CtlSession(
    id: '${j['id']}',
    phase: '${j['phase'] ?? 'JOINING'}',
    capacity: _int(j['capacity']) ?? 5,
    roundDurationSeconds: _int(j['roundDurationSeconds']) ?? 90,
    joinedCount: _int(j['joinedCount']) ?? 0,
  );

  CtlSession copyWith({int? roundDurationSeconds, int? joinedCount}) => CtlSession(
    id: id,
    phase: phase,
    capacity: capacity,
    roundDurationSeconds: roundDurationSeconds ?? this.roundDurationSeconds,
    joinedCount: joinedCount ?? this.joinedCount,
  );
}

class CtlTreasure {
  const CtlTreasure({
    required this.candidateId,
    required this.status,
    this.title = '',
    this.backstory = '',
    this.lockObjective = '',
    this.imageUrl = '',
    this.filterPassed = false,
    this.rubric = const [],
    this.failedStage,
    this.retryable = true,
  });

  final String candidateId;

  /// GENERATING, READY, FAILED or APPROVED.
  final String status;
  final String title;
  final String backstory;
  final String lockObjective;
  final String imageUrl;
  final bool filterPassed;
  final List<String> rubric;
  final String? failedStage;
  final bool retryable;

  bool get generating => status == 'GENERATING';
  bool get failed => status == 'FAILED';
  bool get approved => status == 'APPROVED';

  factory CtlTreasure.fromJson(Json j, {String? status}) => CtlTreasure(
    candidateId: '${j['candidateId'] ?? j['treasureId'] ?? ''}',
    status: status ?? '${j['status'] ?? (j['title'] != null ? 'READY' : 'GENERATING')}',
    title: '${j['title'] ?? ''}',
    backstory: '${j['backstory'] ?? ''}',
    lockObjective: '${j['lockObjective'] ?? ''}',
    imageUrl: '${j['imageUrl'] ?? ''}',
    filterPassed: j['filterPassed'] == true,
    rubric: [for (final r in (_map(j['rubric'])['scoringCriteria'] as List?) ?? const []) '$r'],
    failedStage: _str(j['stage']),
    retryable: j['retryable'] != false,
  );
}

class CtlRound {
  const CtlRound({required this.roundId, required this.roundNumber, required this.durationSeconds, this.roundEndAt});

  final String roundId;
  final int roundNumber;
  final int durationSeconds;
  final DateTime? roundEndAt;

  factory CtlRound.fromJson(Json j) => CtlRound(
    roundId: '${j['roundId']}',
    roundNumber: _int(j['roundNumber']) ?? 0,
    durationSeconds: _int(j['durationSeconds']) ?? 0,
    roundEndAt: _time(j['roundEndAt']),
  );

  CtlRound withEnd(DateTime? end) =>
      CtlRound(roundId: roundId, roundNumber: roundNumber, durationSeconds: durationSeconds, roundEndAt: end ?? roundEndAt);
}

class MonitorStats {
  const MonitorStats({this.promptsScored = 0, this.unlockedCount = 0, this.blockedCount = 0, this.agentErrors = 0});

  final int promptsScored;
  final int unlockedCount;

  /// A count only. Blocked prompt text never reaches the Controller screen.
  final int blockedCount;
  final int agentErrors;

  factory MonitorStats.fromJson(Json j) => MonitorStats(
    promptsScored: _int(j['promptsScored']) ?? 0,
    unlockedCount: _int(j['unlockedCount']) ?? 0,
    blockedCount: _int(j['blockedCount']) ?? 0,
    agentErrors: _int(j['agentErrors']) ?? 0,
  );
}

class FeedItem {
  const FeedItem({
    required this.sequence,
    required this.slotNumber,
    required this.label,
    required this.shape,
    required this.text,
    required this.score,
    this.reaction,
  });

  final int sequence;
  final int slotNumber;
  final String label;
  final String shape;
  final String text;
  final int? score;
  final String? reaction;

  factory FeedItem.fromJson(Json j) => FeedItem(
    sequence: _int(j['sequence']) ?? 0,
    slotNumber: _int(j['slotNumber']) ?? 0,
    label: '${j['label'] ?? ''}',
    shape: '${j['shape'] ?? 'BLUE_CIRCLE'}',
    text: '${j['text'] ?? ''}',
    score: _int(j['score']),
    reaction: _str(j['reaction']),
  );
}

class RankRow {
  const RankRow({
    required this.rank,
    required this.playerId,
    required this.slotNumber,
    required this.label,
    required this.shape,
    this.bestScore,
    this.decidingSequence,
  });

  final int rank;
  final String playerId;
  final int slotNumber;
  final String label;
  final String shape;
  final int? bestScore;
  final int? decidingSequence;

  factory RankRow.fromJson(Json j) => RankRow(
    rank: _int(j['rank']) ?? 0,
    playerId: '${j['playerId'] ?? ''}',
    slotNumber: _int(j['slotNumber']) ?? 0,
    label: '${j['label'] ?? ''}',
    shape: '${j['shape'] ?? 'BLUE_CIRCLE'}',
    bestScore: _int(j['bestScore']),
    decidingSequence: _int(j['decidingSequence']),
  );
}

class RoundResult {
  const RoundResult({
    required this.status,
    required this.ranking,
    required this.canConfirm,
    this.winnerSlot,
    this.winnerLabel,
    this.winnerScore,
    this.tieBreakExplanation,
  });

  /// PROVISIONAL or CONFIRMED.
  final String status;
  final List<RankRow> ranking;
  final bool canConfirm;
  final int? winnerSlot;
  final String? winnerLabel;
  final int? winnerScore;
  final String? tieBreakExplanation;

  bool get hasWinner => winnerLabel != null;
  bool get confirmed => status == 'CONFIRMED';

  factory RoundResult.fromJson(Json j) {
    final w = j['winner'];
    final winner = w is Map ? Map<String, dynamic>.from(w) : null;
    return RoundResult(
      status: '${j['status'] ?? 'PROVISIONAL'}',
      ranking: [for (final r in _list(j['ranking'])) RankRow.fromJson(r)]..sort((a, b) => a.rank.compareTo(b.rank)),
      canConfirm: j['canConfirm'] == true && winner != null,
      winnerSlot: _int(winner?['slotNumber']),
      winnerLabel: _str(winner?['label']),
      winnerScore: _int(winner?['bestScore']),
      tieBreakExplanation: _str(j['tieBreakExplanation']),
    );
  }
}

class WinnerRow {
  const WinnerRow({required this.roundNumber, required this.fullName, required this.score});
  final int roundNumber;
  final String fullName;
  final int score;
}

class EventDay {
  const EventDay({
    this.status = 'OPEN',
    this.confirmedCount = 0,
    this.csvExportedAt,
    this.csvUpToDate = false,
    this.lastCapacity,
    this.lastDuration,
    this.winners = const [],
    this.failure,
  });

  /// OPEN, CLOSING, CLOSED or CLOSING_FAILED.
  final String status;
  final int confirmedCount;
  final DateTime? csvExportedAt;

  /// A CSV covering every confirmed winner has been exported (D44).
  final bool csvUpToDate;
  final int? lastCapacity;
  final int? lastDuration;
  final List<WinnerRow> winners;

  /// Set on CLOSING_FAILED: {stage, code, remaining}.
  final Json? failure;

  bool get open => status == 'OPEN';

  factory EventDay.fromJson(Json j) {
    final last = _map(j['lastSettings']);
    return EventDay(
      status: '${j['status'] ?? 'OPEN'}',
      confirmedCount: _int(j['confirmedCount']) ?? 0,
      csvExportedAt: _time(j['csvExportedAt']),
      csvUpToDate: j['csvUpToDate'] == true,
      lastCapacity: _int(last['capacity']),
      lastDuration: _int(last['roundDurationSeconds']),
      winners: [
        for (final w in _list(j['winners']))
          WinnerRow(roundNumber: _int(w['roundNumber']) ?? 0, fullName: '${w['fullName'] ?? ''}', score: _int(w['score']) ?? 0),
      ],
    );
  }

  EventDay withStatus(String status, Json? failure) => EventDay(
    status: status,
    confirmedCount: confirmedCount,
    csvExportedAt: csvExportedAt,
    csvUpToDate: csvUpToDate,
    lastCapacity: lastCapacity,
    lastDuration: lastDuration,
    winners: winners,
    failure: failure,
  );
}

class AuditItem {
  const AuditItem({required this.id, required this.at, required this.summary, this.reason});
  final String id;
  final DateTime? at;
  final String summary;
  final String? reason;

  factory AuditItem.fromJson(Json j) => AuditItem(
    id: '${j['id'] ?? j['at']}',
    at: _time(j['at']),
    summary: '${j['summary'] ?? j['action'] ?? ''}',
    reason: _str(j['reason']),
  );
}

class AgentHealth {
  const AgentHealth({required this.allHealthy, required this.down, this.checkedAt});
  final bool allHealthy;

  /// Names of agents reporting DOWN, for example "guard".
  final List<String> down;
  final DateTime? checkedAt;

  factory AgentHealth.fromJson(Json j) {
    final agents = _map(j['agents']);
    final down = [
      for (final e in agents.entries)
        if (_map(e.value)['status'] != 'UP') e.key,
    ];
    return AgentHealth(allHealthy: j['allHealthy'] == true && down.isEmpty, down: down, checkedAt: _time(j['checkedAt']));
  }
}

// ---------------------------------------------------------------- state

class ControllerState {
  const ControllerState({
    this.ready = false,
    this.loadError,
    this.connected = true,
    this.serverOffset = Duration.zero,
    this.eventDay = const EventDay(),
    this.session,
    this.slots = const [],
    this.treasure,
    this.round,
    this.stats = const MonitorStats(),
    this.feed = const [],
    this.result,
    this.audit = const [],
    this.auditNextCursor,
    this.health,
  });

  final bool ready;
  final String? loadError;
  final bool connected;

  /// Server clock minus this laptop's clock, from the last `serverNow`.
  final Duration serverOffset;
  final EventDay eventDay;
  final CtlSession? session;
  final List<CtlSlot> slots;
  final CtlTreasure? treasure;
  final CtlRound? round;
  final MonitorStats stats;

  /// Approved prompts only, newest first.
  final List<FeedItem> feed;
  final RoundResult? result;

  /// Newest first (FE-18).
  final List<AuditItem> audit;
  final String? auditNextCursor;
  final AgentHealth? health;

  /// SETUP when no session is open. A discarded or closed session counts as
  /// no session: the Controller goes back to Setup.
  String get phase {
    final p = session?.phase;
    if (p == null || p == 'DISCARDED' || p == 'CLOSED') return 'SETUP';
    return p;
  }

  int get joinedCount => slots.where((s) => s.joined).length;
  bool get allJoined => session != null && joinedCount >= session!.capacity;
  bool get allConnected => allJoined && slots.every((s) => s.player?.connected ?? false);
  bool get allNamesApproved => allJoined && slots.every((s) => s.player?.nameApproved ?? false);
  int get pendingNames => slots.where((s) => s.joined && !s.player!.nameApproved).length;

  /// Phases where names can still be reviewed and the session abandoned.
  bool get beforeRound => const ['JOINING', 'TREASURE_REVIEW', 'READY'].contains(phase);

  /// Time left on the server's clock.
  Duration remaining(DateTime now) {
    final end = round?.roundEndAt;
    if (end == null) return Duration.zero;
    final left = end.difference(now.add(serverOffset));
    return left.isNegative ? Duration.zero : left;
  }

  /// Why Start is disabled, in plain words. Empty when the round can start.
  List<String> startBlockers() => [
    if (!allJoined) 'Waiting for all ${session?.capacity ?? 5} players to join.',
    if (allJoined && !allConnected)
      '${slots.where((s) => !(s.player?.connected ?? false)).map((s) => s.player?.label ?? 'Slot ${s.slotNumber}').join(', ')} disconnected. Waiting for them to come back.',
    if (allJoined && !allNamesApproved) '$pendingNames name${pendingNames == 1 ? '' : 's'} still to review in the Players panel.',
    if (health == null) 'Checking the AI agents…',
    if (health != null && !health!.allHealthy)
      'Agent down: ${health!.down.map(agentName).join(', ')}. The round cannot start until every agent is up.',
    if (treasure?.approved != true) 'Approve a treasure first.',
  ];

  ControllerState copyWith({
    bool? ready,
    String? loadError,
    bool clearLoadError = false,
    bool? connected,
    Duration? serverOffset,
    EventDay? eventDay,
    CtlSession? session,
    bool clearSession = false,
    List<CtlSlot>? slots,
    CtlTreasure? treasure,
    bool clearTreasure = false,
    CtlRound? round,
    bool clearRound = false,
    MonitorStats? stats,
    List<FeedItem>? feed,
    RoundResult? result,
    bool clearResult = false,
    List<AuditItem>? audit,
    String? auditNextCursor,
    bool clearAuditCursor = false,
    AgentHealth? health,
  }) => ControllerState(
    ready: ready ?? this.ready,
    loadError: clearLoadError ? null : (loadError ?? this.loadError),
    connected: connected ?? this.connected,
    serverOffset: serverOffset ?? this.serverOffset,
    eventDay: eventDay ?? this.eventDay,
    session: clearSession ? null : (session ?? this.session),
    slots: slots ?? this.slots,
    treasure: clearTreasure ? null : (treasure ?? this.treasure),
    round: clearRound ? null : (round ?? this.round),
    stats: stats ?? this.stats,
    feed: feed ?? this.feed,
    result: clearResult ? null : (result ?? this.result),
    audit: audit ?? this.audit,
    auditNextCursor: clearAuditCursor ? null : (auditNextCursor ?? this.auditNextCursor),
    health: health ?? this.health,
  );

  /// From `GET /api/controller/sessions/active`. Keeps what the hydrate does
  /// not carry (monitor feed, result, audit, health); [refresh] reloads those.
  ControllerState hydrate(Json d, DateTime receivedAt) {
    final s = d['session'];
    final t = d['treasure'];
    final r = d['round'];
    final serverNow = _time(d['serverNow']);
    final sameRound = r is Map && round?.roundId == '${r['roundId']}';
    return ControllerState(
      ready: true,
      connected: connected,
      serverOffset: serverNow == null ? serverOffset : serverNow.difference(receivedAt),
      eventDay: EventDay.fromJson(_map(d['eventDay'])).withStatus(
        '${_map(d['eventDay'])['status'] ?? 'OPEN'}',
        eventDay.failure,
      ),
      session: s is Map ? CtlSession.fromJson(Map<String, dynamic>.from(s)) : null,
      slots: [for (final x in _list(d['slots'])) CtlSlot.fromJson(x)]..sort((a, b) => a.slotNumber.compareTo(b.slotNumber)),
      treasure: t is Map ? CtlTreasure.fromJson(Map<String, dynamic>.from(t)) : null,
      round: r is Map ? CtlRound.fromJson(Map<String, dynamic>.from(r)) : null,
      stats: sameRound ? stats : const MonitorStats(),
      feed: sameRound ? feed : const [],
      result: sameRound ? result : null,
      audit: audit.isEmpty ? [for (final a in _list(d['audit'])) AuditItem.fromJson(a)] : audit,
      auditNextCursor: auditNextCursor,
      health: health,
    );
  }

  /// Applies one socket event that needs no server round trip.
  ControllerState apply(String event, Json d, DateTime receivedAt) {
    switch (event) {
      case 'player:joined':
        final players = _list(d['players']);
        var next = slots;
        for (final p in players) {
          final n = _int(p['slotNumber']);
          if (n == null) continue;
          // The Controller event has no id or nameReview, so merge it into
          // the player we already have. A new player gets its id on refresh.
          next = [
            for (final s in next)
              s.slotNumber == n
                  ? s.copyWith(
                      slotState: s.joined ? s.slotState : 'LOBBY',
                      player:
                          s.player?.copyWith(
                            label: _str(p['label']),
                            fullName: _str(p['fullName']),
                            connection: _str(p['connection']),
                          ) ??
                          CtlPlayer.fromJson(p),
                    )
                  : s,
          ];
        }
        return copyWith(
          slots: next,
          session: session?.copyWith(joinedCount: _int(d['joinedCount']) ?? session!.joinedCount),
        );

      case 'player:connection':
        final n = _int(d['slotNumber']);
        final conn = '${d['connection']}';
        return copyWith(
          slots: [
            for (final s in slots)
              if (s.slotNumber == n && s.player != null)
                s.copyWith(
                  player: s.player!.copyWith(connection: conn),
                  slotState: conn == 'DISCONNECTED' ? 'DISCONNECTED' : _connectedState(s),
                )
              else
                s,
          ],
        );

      case 'treasure:ready':
        return copyWith(treasure: CtlTreasure.fromJson(d, status: 'READY'));

      case 'treasure:failed':
        return copyWith(
          treasure: CtlTreasure(
            candidateId: '${d['candidateId']}',
            status: 'FAILED',
            failedStage: _str(d['stage']),
            retryable: d['retryable'] != false,
          ),
        );

      case 'timer:sync':
      case 'round:started':
        final serverNow = _time(d['serverNow']);
        final end = _time(d['roundEndAt']);
        return copyWith(
          serverOffset: serverNow?.difference(receivedAt),
          round: event == 'round:started' ? CtlRound.fromJson(d) : round?.withEnd(end),
        );

      case 'monitor:stats':
        return copyWith(stats: MonitorStats.fromJson(d));

      case 'feed:update':
        final item = FeedItem.fromJson(d);
        if (feed.any((f) => f.sequence == item.sequence)) return this;
        final best = _int(d['bestScore']);
        return copyWith(
          feed: [item, ...feed]..sort((a, b) => b.sequence.compareTo(a.sequence)),
          slots: [
            for (final s in slots)
              if (s.slotNumber == item.slotNumber && s.player != null && best != null)
                s.copyWith(player: s.player!.copyWith(bestScore: best))
              else
                s,
          ],
        );

      case 'player:unlocked':
        final n = _int(d['slotNumber']);
        return copyWith(
          slots: [for (final s in slots) s.slotNumber == n ? s.copyWith(slotState: 'LOCKED_100') : s],
        );

      case 'event:status':
        return copyWith(eventDay: eventDay.withStatus('${d['status']}', d['failure'] is Map ? _map(d['failure']) : null));
    }
    return this;
  }

  String _connectedState(CtlSlot s) => switch (phase) {
    'PLAYING' => (s.player?.bestScore ?? 0) >= 100 ? 'LOCKED_100' : 'PLAYING',
    'RESULT_PENDING' => 'RESULT_PENDING',
    'RESULTS' => 'COMPLETE',
    _ => 'LOBBY',
  };
}

/// Plain names for the five agents in `/health/agents`.
String agentName(String key) => switch (key) {
  'treasure' => 'Treasure Generator',
  'image' => 'Image',
  'filter' => 'Filter',
  'guard' => 'Guard',
  'emoji' => 'Emoji',
  _ => key,
};

// ---------------------------------------------------------------- notifier

/// The whole Controller dashboard (FE-11 to FE-18, FE-25, FE-27, FE-28).
///
/// Hydrates from `GET /sessions/active` on load, after every socket
/// (re)connect and on every phase change, so a refresh in any phase restores
/// the screen. Socket events patch the state in between.
class ControllerNotifier extends Notifier<ControllerState> {
  Timer? _resultRetry;
  bool _refreshing = false;
  bool _refreshAgain = false;

  /// Overridable in tests.
  static DateTime Function() now = () => DateTime.now().toUtc();

  ControllerApi get _api => ref.read(controllerApiProvider);

  @override
  ControllerState build() {
    final token = ref.watch(controllerAuthProvider.select((a) => a.token));
    if (token == null) return const ControllerState();

    final socket = createSocket(token);
    final sub = socket.messages.listen((m) => _onEvent(m.event, m.data));
    final statusSub = socket.status.listen((s) => state = state.copyWith(connected: s == SocketStatus.connected));
    // The /controller namespace refuses a signed-out token with
    // UNAUTHENTICATED: same as a REST 401, back to the login card.
    final refusedSub = socket.refused.listen((_) => ref.read(controllerAuthProvider.notifier).expired());
    socket.connect();

    ref.onDispose(() {
      sub.cancel();
      statusSub.cancel();
      refusedSub.cancel();
      _resultRetry?.cancel();
      socket.dispose();
    });
    return const ControllerState();
  }

  /// The `/controller` socket. Its first connect triggers the first hydrate.
  GameSocket createSocket(String token) => GameSocket(
    mock: Env.isMock ? ref.read(mockBackendProvider) : null,
    namespace: '/controller',
    token: token,
    onHydrate: refresh,
  );

  /// Full reload from the server.
  Future<void> refresh() async {
    if (_refreshing) {
      _refreshAgain = true;
      return;
    }
    _refreshing = true;
    try {
      do {
        _refreshAgain = false;
        await _refreshOnce();
      } while (_refreshAgain);
    } finally {
      _refreshing = false;
    }
  }

  Future<void> _refreshOnce() async {
    try {
      final d = await _api.active();
      if (!ref.mounted) return;
      state = state.hydrate(d, now()).copyWith(clearLoadError: true);
    } on ApiException catch (e) {
      if (!ref.mounted) return;
      state = state.copyWith(loadError: controllerErrorText(e));
      return;
    }

    final phase = state.phase;
    final round = state.round;
    await Future.wait([
      loadAudit(),
      if (phase == 'PLAYING' && round != null) _loadMonitor(round.roundId),
      if ((phase == 'RESULT_PENDING' || phase == 'RESULTS') && round != null) loadResult(),
      if (phase == 'READY') loadHealth(),
      if (!state.eventDay.open) _loadEventStatus(),
    ]);
  }

  void _onEvent(String event, Object? data) {
    if (!ref.mounted) return;
    final d = data is Map ? Map<String, dynamic>.from(data) : <String, dynamic>{};
    switch (event) {
      case 'controller:kicked':
        ref.read(controllerAuthProvider.notifier).kicked();
        return;
      case 'phase:changed':
      case 'session:opened':
      case 'session:closed':
      case 'round:ended':
      case 'round:discarded':
      case 'result:confirmed':
        refresh();
        return;
      case 'result:provisional':
        loadResult();
        return;
      case 'player:joined':
        state = state.apply(event, d, now());
        // A player we had not seen before has no id until the next hydrate.
        if (state.slots.any((s) => s.player?.id.isEmpty ?? false)) refresh();
        return;
      case 'player:connection':
        state = state.apply(event, d, now());
        if (d['connection'] == 'CONNECTED') refresh();
        return;
      case 'event:status':
        state = state.apply(event, d, now());
        if (d['status'] == 'CLOSED') refresh();
        return;
    }
    state = state.apply(event, d, now());
  }

  Future<void> _loadMonitor(String roundId) async {
    try {
      final m = await _api.monitor(roundId);
      if (!ref.mounted) return;
      final r = _map(m['round']);
      final serverNow = _time(r['serverNow']);
      state = state.copyWith(
        stats: MonitorStats.fromJson(_map(m['stats'])),
        feed: [for (final f in _list(m['approvedPrompts'])) FeedItem.fromJson(f)]
          ..sort((a, b) => b.sequence.compareTo(a.sequence)),
        serverOffset: serverNow?.difference(now()),
        round: state.round?.withEnd(_time(r['roundEndAt'])),
      );
    } on ApiException {
      // The live screen still works from socket events.
    }
  }

  /// Loads the provisional or confirmed result. RESULT_NOT_READY retries.
  Future<void> loadResult() async {
    final round = state.round;
    if (round == null) return;
    _resultRetry?.cancel();
    try {
      final r = await _api.result(round.roundId);
      if (!ref.mounted) return;
      state = state.copyWith(result: RoundResult.fromJson(r));
    } on ApiException catch (e) {
      if (!ref.mounted) return;
      if (e.code == 'RESULT_NOT_READY' || e.isNetwork) {
        _resultRetry = Timer(const Duration(seconds: 2), loadResult);
      }
    }
  }

  Future<void> loadHealth() async {
    try {
      final h = await _api.agentHealth();
      if (!ref.mounted) return;
      state = state.copyWith(health: AgentHealth.fromJson(h));
    } on ApiException {
      if (!ref.mounted) return;
      state = state.copyWith(health: const AgentHealth(allHealthy: false, down: ['health check']));
    }
  }

  Future<void> loadAudit({bool more = false}) async {
    try {
      final res = await _api.auditLogs(cursor: more ? state.auditNextCursor : null);
      if (!ref.mounted) return;
      final items = [for (final a in _list(res['items'])) AuditItem.fromJson(a)];
      state = state.copyWith(
        audit: more ? [...state.audit, ...items] : items,
        auditNextCursor: _str(res['nextCursor']),
        clearAuditCursor: res['nextCursor'] == null,
      );
    } on ApiException {
      // Keep the entries from the hydrate.
    }
  }

  Future<void> _loadEventStatus() async {
    try {
      final s = await _api.eventStatus();
      if (!ref.mounted) return;
      state = state.copyWith(
        eventDay: state.eventDay.withStatus('${s['status']}', s['failure'] is Map ? _map(s['failure']) : null),
      );
    } on ApiException {
      // Shown from the hydrate.
    }
  }

  /// Runs one Controller action, then reloads. On any error it first puts
  /// back [previous] (when the action changed the screen up front), so a
  /// failed call never leaves a screen the server did not agree to. The
  /// error is rethrown for the screen to show.
  Future<T> _act<T>(Future<T> Function() action, {ControllerState? previous}) async {
    try {
      final res = await action();
      unawaited(refresh());
      return res;
    } catch (_) {
      if (previous != null && ref.mounted) state = previous;
      unawaited(refresh());
      rethrow;
    }
  }

  String get _sessionId => state.session!.id;

  Future<void> openSession(int capacity, int duration) => _act(() => _api.openSession(capacity, duration));

  Future<void> setDuration(int seconds) async {
    final s = state.session;
    if (s == null) return;
    final previous = state;
    state = state.copyWith(session: s.copyWith(roundDurationSeconds: seconds));
    await _act(() => _api.setDuration(s.id, seconds), previous: previous);
  }

  Future<void> abandon(String reason) => _act(() => _api.closeSession(_sessionId, reason: reason));

  Future<void> generateTreasure() async {
    final previous = state;
    state = state.copyWith(treasure: const CtlTreasure(candidateId: '', status: 'GENERATING'));
    await _act(() => _api.generateTreasure(_sessionId), previous: previous);
  }

  Future<void> approveTreasure() => _act(() => _api.approveTreasure(state.treasure!.candidateId));

  Future<void> rejectTreasure() async {
    final id = state.treasure!.candidateId;
    final previous = state;
    state = state.copyWith(treasure: CtlTreasure(candidateId: id, status: 'GENERATING'));
    await _act(() => _api.rejectTreasure(id), previous: previous);
  }

  Future<void> approveName(String playerId) => _act(() => _api.approveName(playerId));

  Future<void> renamePlayer(String playerId, String fullName) => _act(() => _api.renamePlayer(playerId, fullName));

  Future<void> start() async {
    try {
      await _act(() => _api.start(_sessionId));
    } on ApiException catch (e) {
      if (e.code == 'AGENTS_UNAVAILABLE') unawaited(loadHealth());
      rethrow;
    }
  }

  Future<void> confirm() => _act(() => _api.confirm(state.round!.roundId));

  Future<void> discard(String reason) => _act(() => _api.discard(state.round!.roundId, reason));

  /// Closes this session and opens the next with the same settings (FE-27).
  /// One idempotency key per click, so a double click opens one session.
  Future<void> nextGroup(String idempotencyKey) => _act(() => _api.nextGroup(_sessionId, idempotencyKey));

  /// Last group of the day: close without opening another (FE-27).
  Future<void> endSession() => _act(() => _api.closeSession(_sessionId));

  /// Downloads the winners CSV through a Blob (FE-17).
  Future<void> exportCsv() async {
    await _act(() async {
      final csv = await _api.exportWinners();
      downloadTextFile('prompt-heist-winners.csv', csv, mimeType: 'text/csv');
    });
  }

  Future<void> closeEvent() async {
    await _act(() => _api.closeEvent());
    if (ref.mounted) state = state.copyWith(eventDay: state.eventDay.withStatus('CLOSING', null));
  }
}

final controllerProvider = NotifierProvider<ControllerNotifier, ControllerState>(ControllerNotifier.new);
