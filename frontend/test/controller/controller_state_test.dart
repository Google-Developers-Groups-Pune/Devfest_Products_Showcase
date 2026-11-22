import 'package:flutter_test/flutter_test.dart';

import 'package:prompt_heist/features/controller/controller_state.dart';
import 'package:prompt_heist/features/controller/panels/setup_panels.dart';

Map<String, dynamic> _slot(int n, {String? name, String review = 'APPROVED', String conn = 'CONNECTED'}) => {
  'slotNumber': n,
  'code': '${10 + n}',
  'shape': 'BLUE_CIRCLE',
  'slotState': name == null ? 'UNJOINED' : 'LOBBY',
  'player': name == null
      ? null
      : {
          'id': 'ply_$n',
          'label': name,
          'fullName': '$name Rao',
          'entranceId': 'DF-$n',
          'connection': conn,
          'bestScore': null,
          'nameReview': review,
        },
};

Map<String, dynamic> _hydrate({String? phase = 'READY', List<Map<String, dynamic>>? slots, String treasure = 'APPROVED'}) => {
  'serverNow': '2026-12-05T10:00:10.000Z',
  'eventDay': {'id': 'evt_01', 'status': 'OPEN', 'confirmedCount': 0, 'csvUpToDate': false, 'winners': [], 'lastSettings': null},
  'session': phase == null ? null : {'id': 'ses_01', 'phase': phase, 'capacity': 5, 'roundDurationSeconds': 90, 'joinedCount': 5},
  'slots': slots ?? [for (var i = 1; i <= 5; i++) _slot(i, name: 'P$i')],
  'treasure': {'candidateId': 'cnd_1', 'status': treasure, 'title': 'The Saffron Vault'},
  'round': {'roundId': 'rnd_1', 'roundNumber': 1, 'durationSeconds': 90, 'roundEndAt': '2026-12-05T10:01:30.000Z'},
  'audit': [],
};

void main() {
  final at = DateTime.utc(2026, 12, 5, 10, 0, 0);
  const healthy = AgentHealth(allHealthy: true, down: []);

  test('no session, discarded or closed all show Setup', () {
    expect(const ControllerState().hydrate(_hydrate(phase: null), at).phase, 'SETUP');
    expect(const ControllerState().hydrate(_hydrate(phase: 'DISCARDED'), at).phase, 'SETUP');
    expect(const ControllerState().hydrate(_hydrate(phase: 'CLOSED'), at).phase, 'SETUP');
  });

  test('Start blockers name every reason, and clear when all is ready', () {
    final slots = [
      _slot(1, name: 'Neha', review: 'PENDING'),
      _slot(2, name: 'Dev', conn: 'DISCONNECTED'),
      for (var i = 3; i <= 5; i++) _slot(i, name: 'P$i'),
    ];
    final s = const ControllerState().hydrate(_hydrate(slots: slots), at).copyWith(
      health: const AgentHealth(allHealthy: false, down: ['guard']),
    );
    final b = s.startBlockers().join('\n');
    expect(b, contains('Dev disconnected'));
    expect(b, contains('1 name still to review'));
    expect(b, contains('Agent down: Guard'));

    final ok = const ControllerState().hydrate(_hydrate(), at).copyWith(health: healthy);
    expect(ok.startBlockers(), isEmpty);
  });

  test('server clock offset drives the remaining time', () {
    // serverNow is 10 s ahead of the laptop clock.
    final s = const ControllerState().hydrate(_hydrate(phase: 'PLAYING'), at);
    expect(s.serverOffset, const Duration(seconds: 10));
    expect(s.remaining(at), const Duration(seconds: 80));
  });

  test('feed:update adds once, updates best score; blocked text never stored', () {
    var s = const ControllerState().hydrate(_hydrate(phase: 'PLAYING'), at);
    final ev = {'sequence': 7, 'slotNumber': 2, 'label': 'P2', 'shape': 'RED_SQUARE', 'text': 'hi', 'score': 55, 'bestScore': 55};
    s = s.apply('feed:update', ev, at).apply('feed:update', ev, at);
    expect(s.feed, hasLength(1));
    expect(s.slots[1].player!.bestScore, 55);
    s = s.apply('monitor:stats', {'promptsScored': 1, 'unlockedCount': 0, 'blockedCount': 3, 'agentErrors': 0}, at);
    expect(s.stats.blockedCount, 3);
  });

  test('player:connection and player:unlocked update the slot chip', () {
    var s = const ControllerState().hydrate(_hydrate(phase: 'PLAYING'), at);
    s = s.apply('player:connection', {'slotNumber': 3, 'connection': 'DISCONNECTED'}, at);
    expect(s.slots[2].slotState, 'DISCONNECTED');
    s = s.apply('player:unlocked', {'slotNumber': 1}, at);
    expect(s.slots[0].slotState, 'LOCKED_100');
  });

  test('treasure:ready and treasure:failed', () {
    var s = const ControllerState().hydrate(_hydrate(phase: 'TREASURE_REVIEW', treasure: 'GENERATING'), at);
    s = s.apply('treasure:failed', {'candidateId': 'cnd_1', 'stage': 'IMAGE', 'retryable': true}, at);
    expect(s.treasure!.failed, isTrue);
    expect(s.treasure!.failedStage, 'IMAGE');
    s = s.apply('treasure:ready', {
      'candidateId': 'cnd_2',
      'title': 'T',
      'imageUrl': 'u',
      'filterPassed': true,
      'rubric': {'scoringCriteria': ['a', 'b']},
    }, at);
    expect(s.treasure!.status, 'READY');
    expect(s.treasure!.rubric, ['a', 'b']);
  });

  test('result with no winner cannot be confirmed', () {
    final r = RoundResult.fromJson({
      'status': 'PROVISIONAL',
      'winner': null,
      'ranking': [
        {'rank': 1, 'label': 'A', 'bestScore': null},
      ],
      'canConfirm': false,
    });
    expect(r.canConfirm, isFalse);
    expect(r.hasWinner, isFalse);
  });

  test('duration stepper: 20 s steps, never zero, no maximum', () {
    expect(durationDown(90), 70);
    expect(durationDown(40), 20);
    expect(durationDown(20), isNull);
    expect(durationDown(10), isNull);
    expect(durationUp(9980), 10000);
  });
}
