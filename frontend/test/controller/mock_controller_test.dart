import 'package:flutter_test/flutter_test.dart';

import 'package:prompt_heist/core/mock/mock_controller.dart';

/// The mock booth follows the contract, so the Controller screens built on it
/// behave the same against the real backend.
void main() {
  late DateTime now;
  late Map<String, String> auth;

  (int, dynamic) call(String method, String path, [Map body = const {}, Map<String, String> extra = const {}]) =>
      MockController.handle(method, '/api/controller/$path', body, {...auth, ...extra});

  Matcher error(String code) => throwsA(isA<MockError>().having((e) => e.code, 'code', code));

  void advance(int seconds) {
    now = now.add(Duration(seconds: seconds));
    MockController.tick();
  }

  Map hydrate() => call('GET', 'sessions/active').$2 as Map;
  String sessionId() => (hydrate()['session'] as Map)['id'] as String;

  setUp(() {
    MockController.autoClock = false;
    MockController.reset();
    now = DateTime.utc(2026, 12, 5, 10);
    MockController.clock = () => now;
    auth = {};
    final (_, res) = call('POST', 'auth/login', {'username': 'controller', 'password': 'devfest'});
    auth = {'Authorization': 'Bearer ${(res as Map)['token']}'};
  });

  /// Opens a session, fills it, approves the treasure and every name.
  void toReady() {
    call('POST', 'sessions', {'capacity': 5, 'roundDurationSeconds': 90});
    MockController.fillPlayers();
    final id = sessionId();
    call('POST', 'sessions/$id/treasure');
    advance(MockController.generationSeconds);
    final cand = (hydrate()['treasure'] as Map)['candidateId'];
    call('POST', 'treasure/$cand/approve');
    for (final s in hydrate()['slots'] as List) {
      call('POST', 'players/${((s as Map)['player'] as Map)['id']}/name-review', {'decision': 'APPROVED'});
    }
  }

  test('login: wrong password is 401, five failures a minute is 429', () {
    auth = {};
    for (var i = 0; i < 5; i++) {
      expect(() => call('POST', 'auth/login', {'username': 'controller', 'password': 'x'}), error('INVALID_CREDENTIALS'));
    }
    expect(() => call('POST', 'auth/login', {'username': 'controller', 'password': 'devfest'}), error('TOO_MANY_ATTEMPTS'));
    now = now.add(const Duration(minutes: 2));
    expect(call('POST', 'auth/login', {'username': 'controller', 'password': 'devfest'}).$1, 200);
  });

  test('every Controller route needs the token', () {
    auth = {'Authorization': 'Bearer nope'};
    expect(() => call('GET', 'sessions/active'), error('UNAUTHENTICATED'));
  });

  test('signing in again kicks the old dashboard', () async {
    final events = <String>[];
    final sub = MockController.events.stream.listen((e) => events.add(e.$1));
    call('POST', 'auth/login', {'username': 'controller', 'password': 'devfest'});
    await Future<void>.delayed(Duration.zero);
    expect(events, contains('controller:kicked'));
    await sub.cancel();
  });

  test('open session: validation and one unique code per slot', () {
    expect(() => call('POST', 'sessions', {'capacity': 3}), error('VALIDATION_FAILED'));
    expect(() => call('POST', 'sessions', {'capacity': 5, 'roundDurationSeconds': 0}), error('VALIDATION_FAILED'));
    final (status, res) = call('POST', 'sessions', {'capacity': 4, 'roundDurationSeconds': 140});
    expect(status, 201);
    final codes = [for (final s in (res as Map)['slots'] as List) (s as Map)['code']];
    expect(codes.toSet(), hasLength(4));
    expect(() => call('POST', 'sessions', {'capacity': 5}), error('SESSION_ALREADY_ACTIVE'));
    expect((hydrate()['eventDay'] as Map)['lastSettings'], {'capacity': 4, 'roundDurationSeconds': 140});
  });

  test('treasure needs everyone joined, then fails and retries', () {
    call('POST', 'sessions', {'capacity': 5});
    final id = sessionId();
    expect(() => call('POST', 'sessions/$id/treasure'), error('PLAYERS_NOT_JOINED'));
    MockController.fillPlayers();
    MockController.setDemo('failNextGeneration', true);
    call('POST', 'sessions/$id/treasure');
    expect(() => call('POST', 'sessions/$id/treasure'), error('GENERATION_IN_PROGRESS'));
    advance(MockController.generationSeconds);
    expect((hydrate()['treasure'] as Map)['status'], 'FAILED');
    call('POST', 'sessions/$id/treasure'); // Retry
    advance(MockController.generationSeconds);
    final t = hydrate()['treasure'] as Map;
    expect(t['status'], 'READY');
    expect(t['imageUrl'], isNotEmpty);
  });

  test('reject twice, approve once', () {
    call('POST', 'sessions', {'capacity': 5});
    MockController.fillPlayers();
    final id = sessionId();
    call('POST', 'sessions/$id/treasure');
    expect(() => call('POST', 'treasure/cnd_1/approve'), error('CANDIDATE_NOT_READY'));
    for (var i = 1; i <= 2; i++) {
      advance(MockController.generationSeconds);
      final (_, res) = call('POST', 'treasure/cnd_$i/reject');
      expect((res as Map)['rejectedCandidateId'], 'cnd_$i');
    }
    advance(MockController.generationSeconds);
    call('POST', 'treasure/cnd_3/approve');
    expect((hydrate()['session'] as Map)['phase'], 'READY');
  });

  test('start: names, connection and agents each block it', () {
    call('POST', 'sessions', {'capacity': 5});
    MockController.fillPlayers();
    final id = sessionId();
    call('POST', 'sessions/$id/treasure');
    advance(MockController.generationSeconds);
    call('POST', 'treasure/cnd_1/approve');
    expect(() => call('POST', 'sessions/$id/start'), error('NAMES_NOT_REVIEWED'));

    final slots = hydrate()['slots'] as List;
    final first = ((slots.first as Map)['player'] as Map)['id'];
    expect(() => call('POST', 'players/$first/name-review', {'decision': 'RENAMED', 'fullName': ' '}), error('NAME_REQUIRED'));
    final (_, renamed) = call('POST', 'players/$first/name-review', {'decision': 'RENAMED', 'fullName': 'Aman Sharma'});
    expect(((renamed as Map)['player'] as Map)['label'], 'Aman');
    for (final s in slots.skip(1)) {
      call('POST', 'players/${((s as Map)['player'] as Map)['id']}/name-review', {'decision': 'APPROVED'});
    }

    MockController.toggleDisconnect();
    expect(() => call('POST', 'sessions/$id/start'), error('PLAYERS_NOT_READY'));
    MockController.toggleDisconnect();
    MockController.setDemo('agentDown', true);
    expect(() => call('POST', 'sessions/$id/start'), throwsA(isA<MockError>().having((e) => e.status, 'status', 503)));
    final health = call('GET', 'health/agents').$2 as Map;
    expect(health['allHealthy'], false);
    MockController.setDemo('agentDown', false);
    expect(call('POST', 'sessions/$id/start').$1, 200);
    expect((hydrate()['session'] as Map)['phase'], 'PLAYING');
  });

  test('round: monitor never carries blocked text, then a provisional result', () {
    toReady();
    final id = sessionId();
    call('POST', 'sessions/$id/start');
    for (var i = 0; i < 20; i++) {
      advance(3);
    }
    final rid = (hydrate()['round'] as Map)['roundId'];
    final mon = call('GET', 'rounds/$rid/monitor').$2 as Map;
    expect((mon['stats'] as Map).keys, containsAll(['promptsScored', 'unlockedCount', 'blockedCount', 'agentErrors']));
    for (final p in mon['approvedPrompts'] as List) {
      expect((p as Map)['sequence'], isA<int>());
    }
    expect(() => call('GET', 'rounds/$rid/result'), error('RESULT_NOT_READY'));
    advance(60);
    expect((hydrate()['session'] as Map)['phase'], 'RESULT_PENDING');
    advance(2);
    final r = call('GET', 'rounds/$rid/result').$2 as Map;
    expect(r['status'], 'PROVISIONAL');
    expect(r['ranking'], hasLength(5));
  });

  test('tie at 100: the earlier submission wins and the result says why', () {
    MockController.setDemo('tieAt100', true);
    toReady();
    final id = sessionId();
    call('POST', 'sessions/$id/start');
    for (var i = 0; i < 40 && MockController.demo['tieAt100'] == true; i++) {
      advance(5);
    }
    MockController.endRoundNow();
    advance(2);
    final rid = (hydrate()['round'] as Map)['roundId'];
    final r = call('GET', 'rounds/$rid/result').$2 as Map;
    final ranking = r['ranking'] as List;
    expect((ranking[0] as Map)['bestScore'], 100);
    expect((ranking[1] as Map)['bestScore'], 100);
    expect((ranking[0] as Map)['decidingSequence'], lessThan((ranking[1] as Map)['decidingSequence'] as int));
    expect(r['tieBreakExplanation'], startsWith('Tie on 100.'));
  });

  test('no scores: cannot confirm, discard needs a reason and frees the session', () {
    MockController.setDemo('noScores', true);
    toReady();
    final id = sessionId();
    call('POST', 'sessions/$id/start');
    MockController.endRoundNow();
    advance(2);
    final rid = (hydrate()['round'] as Map)['roundId'];
    final r = call('GET', 'rounds/$rid/result').$2 as Map;
    expect(r['canConfirm'], false);
    expect(r['winner'], isNull);
    expect(() => call('POST', 'rounds/$rid/confirm'), error('NO_WINNER'));
    expect(() => call('POST', 'rounds/$rid/discard', {'reason': '  '}), error('REASON_REQUIRED'));
    call('POST', 'rounds/$rid/discard', {'reason': 'Wi-Fi dropped'});
    expect(hydrate()['session'], isNull);
  });

  test('confirm, then Next group twice with one key opens one session', () {
    MockController.setDemo('tieAt100', true); // makes sure somebody scores
    toReady();
    final id = sessionId();
    call('POST', 'sessions/$id/start');
    for (var i = 0; i < 10; i++) {
      advance(3);
    }
    MockController.endRoundNow();
    advance(2);
    final rid = (hydrate()['round'] as Map)['roundId'];
    expect((call('GET', 'rounds/$rid/result').$2 as Map)['canConfirm'], true);
    call('POST', 'rounds/$rid/confirm');
    expect(call('POST', 'rounds/$rid/confirm').$1, 200, reason: 'confirm is safe to repeat');
    advance(120);
    expect((hydrate()['session'] as Map)['phase'], 'RESULTS', reason: 'nothing happens on a timer');

    expect(() => call('POST', 'sessions/$id/next-group'), error('IDEMPOTENCY_KEY_REQUIRED'));
    final a = call('POST', 'sessions/$id/next-group', {}, {'Idempotency-Key': 'k1'}).$2 as Map;
    final b = call('POST', 'sessions/$id/next-group', {}, {'Idempotency-Key': 'k1'}).$2 as Map;
    expect((a['session'] as Map)['id'], (b['session'] as Map)['id']);
    expect((hydrate()['session'] as Map)['phase'], 'JOINING');
    expect((hydrate()['eventDay'] as Map)['confirmedCount'], 1);
  });

  test('abandon needs a reason before the round', () {
    call('POST', 'sessions', {'capacity': 5});
    final id = sessionId();
    expect(() => call('POST', 'sessions/$id/close', {}), error('REASON_REQUIRED'));
    call('POST', 'sessions/$id/close', {'reason': 'Only 3 players turned up'});
    expect(hydrate()['session'], isNull);
    final audit = call('GET', 'audit-logs').$2 as Map;
    expect(((audit['items'] as List).first as Map)['reason'], 'Only 3 players turned up');
  });

  test('close event: blocked until a CSV is exported, then closes; failure can retry', () {
    expect(() => call('POST', 'event/close', {'confirmation': 'CLOSE EVENT'}), error('CSV_NOT_EXPORTED'));
    final csv = call('GET', 'winners/export').$2 as String;
    expect(csv.trim(), 'full_name,entrance_id,round_number,confirmed_at,winning_score,treasure_title,treasure_id');
    expect(() => call('POST', 'event/close', {'confirmation': 'nope'}), error('CONFIRMATION_REQUIRED'));

    MockController.setDemo('failNextClose', true);
    expect(call('POST', 'event/close', {'confirmation': 'CLOSE EVENT'}).$1, 202);
    advance(3);
    final failed = call('GET', 'event/status').$2 as Map;
    expect(failed['status'], 'CLOSING_FAILED');
    expect((failed['failure'] as Map)['stage'], 'STORAGE');

    call('POST', 'event/close', {'confirmation': 'CLOSE EVENT'});
    advance(3);
    expect((call('GET', 'event/status').$2 as Map)['status'], 'CLOSED');
    expect(() => call('POST', 'sessions', {'capacity': 5}), error('EVENT_CLOSED'));
  });
}
