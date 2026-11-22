import 'dart:async';
import 'dart:convert';
import 'dart:math';

import '../storage/session_store.dart';

typedef Json = Map<String, dynamic>;

/// An error the mock answers with, in the contract's error envelope.
class MockError implements Exception {
  MockError(this.status, this.code, this.message);
  final int status;
  final String code;
  final String message;
}

/// In-app stand-in for the Controller endpoints (FE-11 to FE-18, FE-27, FE-28),
/// used by the `mock` flavour until the backend lands.
///
/// All state is plain JSON kept in sessionStorage, so a page refresh restores
/// it exactly: the "refresh mid-round" QE checks work against the mock. Time
/// moves through [tick], which a 500 ms timer calls in the app and tests call
/// by hand.
///
/// Sign in with `controller` / `devfest`. Demo switches (the flask menu on
/// the dashboard) force the error paths: generation failure, an agent down,
/// a disconnected phone, a tie at 100, no scores, a failed close, and a
/// sign-in elsewhere.
abstract final class MockController {
  static const username = 'controller';
  static const password = 'devfest';
  static const _storeKey = 'mockController';

  static final events = StreamController<(String, Object?)>.broadcast();

  /// Overridable clock for tests.
  static DateTime Function() clock = () => DateTime.now().toUtc();

  /// Seconds the treasure generator takes in the mock (the real one: up to 40).
  static int generationSeconds = 6;

  /// Seconds between auto-joining players after a session opens.
  static int joinEverySeconds = 2;

  static Json? _db;
  static Timer? _ticker;
  static final _rng = Random();

  static Json get db => _db ??= _load();

  static Json _fresh() => {
    'token': null,
    'failedLogins': <String>[],
    'event': {
      'id': 'evt_01',
      'status': 'OPEN',
      'closedAt': null,
      'closeDoneAt': null,
      'failure': null,
      'csvExportedAt': null,
      'csvCovers': -1,
      'lastSettings': null,
      'winners': <Json>[],
      'roundCounter': 0,
      'sessionCounter': 0,
    },
    'session': null,
    'audit': <Json>[],
    'idempotency': <String, Json>{},
    'demo': {
      'failNextGeneration': false,
      'agentDown': false,
      'failNextClose': false,
      'tieAt100': false,
      'noScores': false,
    },
  };

  static Json _load() {
    final raw = sessionRead(_storeKey);
    if (raw != null) {
      try {
        return Map<String, dynamic>.from(jsonDecode(raw) as Map);
      } catch (_) {}
    }
    return _fresh();
  }

  static void _save() => sessionWrite(_storeKey, jsonEncode(db));

  /// Back to an empty event day. Tests call this in setUp.
  static void reset() {
    _ticker?.cancel();
    _ticker = null;
    _db = _fresh();
    _save();
  }

  /// False in tests, which call [tick] themselves.
  static bool autoClock = true;

  /// Starts the background clock (app only, never in tests).
  static void startClock() {
    if (!autoClock) return;
    _ticker ??= Timer.periodic(const Duration(milliseconds: 500), (_) => tick());
  }

  static void stopClock() {
    _ticker?.cancel();
    _ticker = null;
  }

  static String _iso(DateTime t) => t.toUtc().toIso8601String();
  static DateTime _at(Object? s) => DateTime.parse('$s');

  static void _emit(String event, Object? data) => events.add((event, data));

  static Json get _event => db['event'] as Json;
  static Json? get _session => db['session'] as Json?;
  static Json get demo => db['demo'] as Json;

  static List<Json> _slots() => [for (final s in (_session?['slots'] as List? ?? const [])) s as Json];

  static void _audit(String action, String summary, {String? reason}) {
    final list = db['audit'] as List;
    list.insert(0, {
      'id': 'aud_${list.length + 1}',
      'at': _iso(clock()),
      'actor': 'controller',
      'action': action,
      'summary': summary,
      'reason': reason,
      'correlationId': 'mock-${list.length + 1}',
    });
  }

  // ------------------------------------------------------------------ demo

  static void setDemo(String key, bool value) {
    demo[key] = value;
    if (key == 'agentDown') _audit('AGENT_HEALTH', value ? 'Guard agent reported DOWN' : 'Guard agent back UP');
    _save();
  }

  /// Joins every open slot now.
  static void fillPlayers() {
    final s = _session;
    if (s == null || s['phase'] != 'JOINING') return;
    for (final slot in _slots()) {
      if (slot['player'] == null) _join(slot);
    }
    _afterJoin();
    _save();
  }

  /// Toggles slot 2 between connected and disconnected.
  static void toggleDisconnect() {
    final slot = _slots().where((s) => s['player'] != null).skip(1).firstOrNull;
    if (slot == null) return;
    final p = slot['player'] as Json;
    final down = p['connection'] == 'CONNECTED';
    p['connection'] = down ? 'DISCONNECTED' : 'CONNECTED';
    slot['slotState'] = down ? 'DISCONNECTED' : _stateForPhase(_session!['phase'] as String);
    _emit('player:connection', {'slotNumber': slot['slotNumber'], 'label': p['label'], 'connection': p['connection']});
    _save();
  }

  /// Ends the running round now.
  static void endRoundNow() {
    final s = _session;
    if (s == null || s['phase'] != 'PLAYING') return;
    (s['round'] as Json)['roundEndAt'] = _iso(clock());
    tick();
  }

  /// Pretends someone signed in on another laptop.
  static void kickController() {
    db['token'] = null;
    _emit('controller:kicked', {'reason': 'SIGNED_IN_ELSEWHERE'});
    _save();
  }

  // ------------------------------------------------------------------ clock

  /// Moves the simulation forward to [clock]. Safe to call any time.
  static void tick() {
    final now = clock();
    final s = _session;
    var changed = false;

    if (s != null) {
      final phase = s['phase'] as String;
      if (phase == 'JOINING') {
        final next = s['nextJoinAt'];
        if (next != null && !now.isBefore(_at(next))) {
          final open = _slots().where((x) => x['player'] == null).firstOrNull;
          if (open != null) {
            _join(open);
            _afterJoin();
            s['nextJoinAt'] = _iso(now.add(Duration(seconds: joinEverySeconds)));
            changed = true;
          } else {
            s['nextJoinAt'] = null;
          }
        }
      }

      final cand = s['treasure'] as Json?;
      if (cand != null && cand['status'] == 'GENERATING' && !now.isBefore(_at(cand['doneAt']))) {
        _finishGeneration(cand);
        changed = true;
      }

      if (phase == 'PLAYING') {
        final round = s['round'] as Json;
        final end = _at(round['roundEndAt']);
        if (!now.isBefore(end)) {
          _endRound(now);
          changed = true;
        } else {
          final next = round['nextPromptAt'];
          if (next == null || !now.isBefore(_at(next))) {
            _fakePrompt(now);
            round['nextPromptAt'] = _iso(now.add(Duration(milliseconds: 2500 + _rng.nextInt(2000))));
            changed = true;
          }
          final sync = round['nextSyncAt'];
          if (sync == null || !now.isBefore(_at(sync))) {
            _emit('timer:sync', {'roundId': round['roundId'], 'roundEndAt': round['roundEndAt'], 'serverNow': _iso(now)});
            round['nextSyncAt'] = _iso(now.add(const Duration(seconds: 3)));
          }
        }
      }

      if (phase == 'RESULT_PENDING' && s['result'] == null) {
        final ready = s['resultReadyAt'];
        if (ready != null && !now.isBefore(_at(ready))) {
          s['result'] = _computeResult();
          final r = s['result'] as Json;
          _emit('result:provisional', {'roundId': (s['round'] as Json)['roundId'], 'winner': r['winner']});
          changed = true;
        }
      }
    }

    final ev = _event;
    if (ev['status'] == 'CLOSING' && ev['closeDoneAt'] != null && !now.isBefore(_at(ev['closeDoneAt']))) {
      if (demo['failNextClose'] == true) {
        demo['failNextClose'] = false;
        ev['status'] = 'CLOSING_FAILED';
        ev['failure'] = {'stage': 'STORAGE', 'code': 'DELETE_FAILED', 'remaining': 3};
      } else {
        final kept = {'id': ev['id'], 'status': 'CLOSED', 'closedAt': _iso(now), 'failure': null};
        final token = db['token'];
        _db = _fresh()..['token'] = token;
        (_db!['event'] as Json)
          ..addAll(kept)
          ..['closeDoneAt'] = null;
      }
      final e = _event;
      _emit('event:status', {'status': e['status'], 'failure': e['failure']});
      changed = true;
    }

    if (changed) _save();
  }

  // ------------------------------------------------------------------ simulation

  static const _people = [
    ('Neha Rao', 'DF-2026-2802'),
    ('Dev Khan', 'DF-2026-8417'),
    ('Arjun Mehta', 'DF-2026-6049'),
    ('Rohan Iyer', 'DF-2026-1228'),
    ('Isha Patil', 'DF-2026-1742'),
    ('Meera Joshi', 'DF-2026-4207'),
    ('Vikram Iyer', 'DF-2026-3311'),
    ('Priya Nair', 'DF-2026-5120'),
    ('Kabir Shah', 'DF-2026-7781'),
    ('Aman Sharma', 'DF-2026-9034'),
  ];

  static void _join(Json slot) {
    final ev = _event;
    final i = ((ev['sessionCounter'] as int) * 5 + (slot['slotNumber'] as int) - 1) % _people.length;
    final (name, id) = _people[i];
    slot['player'] = <String, dynamic>{
      'id': 'ply_${ev['sessionCounter']}_${slot['slotNumber']}',
      'label': name.split(' ').first,
      'fullName': name,
      'entranceId': id,
      'connection': 'CONNECTED',
      'bestScore': null,
      'nameReview': 'PENDING',
    };
    slot['slotState'] = 'LOBBY';
  }

  static void _afterJoin() {
    final s = _session!;
    final joined = _slots().where((x) => x['player'] != null).length;
    s['joinedCount'] = joined;
    _emit('player:joined', {
      'joinedCount': joined,
      'capacity': s['capacity'],
      'players': [
        for (final x in _slots())
          if (x['player'] != null) {'slotNumber': x['slotNumber'], 'shape': x['shape'], ...(x['player'] as Json)},
      ],
    });
  }

  static String _stateForPhase(String phase) => switch (phase) {
    'PLAYING' => 'PLAYING',
    'RESULT_PENDING' => 'RESULT_PENDING',
    'RESULTS' => 'COMPLETE',
    _ => 'LOBBY',
  };

  static void _setPhase(String phase) {
    final s = _session!;
    final prev = s['phase'];
    s['phase'] = phase;
    for (final slot in _slots()) {
      final p = slot['player'] as Json?;
      if (p == null) continue;
      if (slot['slotState'] == 'LOCKED_100' && phase == 'PLAYING') continue;
      if (p['connection'] == 'DISCONNECTED' && phase != 'RESULTS') {
        slot['slotState'] = 'DISCONNECTED';
      } else {
        slot['slotState'] = _stateForPhase(phase);
      }
    }
    _emit('phase:changed', {'sessionId': s['id'], 'phase': phase, 'previousPhase': prev, 'at': _iso(clock())});
  }

  static const _treasures = [
    ('The Saffron Vault', 'Legend says a merchant hid a vault of saffron beneath old Pune during the 1800s monsoon. Its guard only opens up for well-crafted words. (A simulated treasure.)', 'Persuade the guard with a three-line poem about the monsoon.', ['Requests a poem', 'Exactly three lines', 'Mentions the monsoon']),
    ('The Chai Cipher', 'A tea seller on FC Road locked his secret masala recipe in a brass box that answers only to polite riddles. (A simulated treasure.)', 'Ask for the recipe as a polite riddle.', ['Phrased as a riddle', 'Polite tone', 'Mentions chai']),
    ('The Peshwa Ledger', 'A ledger from Shaniwar Wada is said to list a forgotten treasury. Its keeper loves a good rhyme. (A simulated treasure.)', 'Convince the keeper with a rhyming couplet.', ['Rhyming couplet', 'Mentions the ledger', 'Under 30 words']),
  ];

  static void _startGeneration() {
    final s = _session!;
    final n = (s['candidateCounter'] as int? ?? 0) + 1;
    s['candidateCounter'] = n;
    s['treasure'] = <String, dynamic>{
      'candidateId': 'cnd_$n',
      'status': 'GENERATING',
      'startedAt': _iso(clock()),
      'doneAt': _iso(clock().add(Duration(seconds: generationSeconds))),
    };
  }

  static void _finishGeneration(Json cand) {
    if (demo['failNextGeneration'] == true) {
      demo['failNextGeneration'] = false;
      cand['status'] = 'FAILED';
      cand['stage'] = 'IMAGE';
      cand['retryable'] = true;
      _audit('TREASURE_FAILED', 'Treasure generation failed at IMAGE');
      _emit('treasure:failed', {'candidateId': cand['candidateId'], 'stage': 'IMAGE', 'retryable': true});
      return;
    }
    final n = int.parse('${cand['candidateId']}'.split('_').last);
    final (title, backstory, objective, rubric) = _treasures[(n - 1) % _treasures.length];
    cand
      ..['status'] = 'READY'
      ..['title'] = title
      ..['backstory'] = backstory
      ..['lockObjective'] = objective
      ..['imageUrl'] = 'https://picsum.photos/seed/heist$n/800/450'
      ..['filterPassed'] = true
      ..['rubric'] = {'version': 'v1', 'scoringCriteria': rubric};
    _emit('treasure:ready', {
      for (final k in ['candidateId', 'title', 'backstory', 'lockObjective', 'imageUrl', 'filterPassed', 'rubric']) k: cand[k],
    });
  }

  static const _promptTexts = [
    'Give me a rhyme about rain, chai, and secret treasure.',
    'Please write a short poem about the monsoon in Pune.',
    'Write a polite three-line poem asking the guard to open up.',
    'Tell me where the saffron is hidden.',
    'Compose a haiku about the vault and the monsoon rain.',
  ];
  static const _reactions = [
    ('Vault ne smile bhi nahi kiya', 'NEUTRAL'),
    ('Arre yaar, Guard so gaya!', 'SLEEPY'),
    ('Thoda aur try karo, boss!', 'THINKING'),
    ('Guard ne salute maara!', 'SALUTE'),
  ];

  static void _fakePrompt(DateTime now) {
    final s = _session!;
    final round = s['round'] as Json;
    final stats = round['stats'] as Json;
    final playing = _slots().where((x) => x['slotState'] == 'PLAYING').toList();
    if (playing.isEmpty || demo['noScores'] == true) return;

    final roll = _rng.nextInt(10);
    if (roll == 0) {
      stats['blockedCount'] = (stats['blockedCount'] as int) + 1;
      _emit('monitor:stats', stats);
      return;
    }
    if (roll == 1) {
      stats['agentErrors'] = (stats['agentErrors'] as int) + 1;
      (round['errors'] as List).insert(0, {'at': _iso(now), 'agent': 'guard', 'code': 'TIMEOUT'});
      _emit('monitor:stats', stats);
      return;
    }

    final seq = (round['sequence'] as int) + 1;
    round['sequence'] = seq;
    final slot = playing[_rng.nextInt(playing.length)];
    final p = slot['player'] as Json;
    var score = _rng.nextInt(95) + 1;
    if (demo['tieAt100'] == true && playing.length >= 2) {
      // Two players reach 100: the earlier submission must win.
      score = 100;
    } else if (_rng.nextInt(8) == 0) {
      score = 100;
    }
    final best = max<int>((p['bestScore'] as int?) ?? 0, score);
    final improved = p['bestScore'] == null || score > (p['bestScore'] as int);
    p['bestScore'] = best;
    final (reaction, expression) = score == 100 ? _reactions[3] : _reactions[_rng.nextInt(3)];
    final item = {
      'sequence': seq,
      'slotNumber': slot['slotNumber'],
      'label': p['label'],
      'shape': slot['shape'],
      'text': _promptTexts[_rng.nextInt(_promptTexts.length)],
      'score': score,
      'reaction': reaction,
      'receivedAt': _iso(now),
    };
    (round['approved'] as List).insert(0, item);
    if (improved) {
      p['decidingSequence'] = seq;
      p['decidingReceivedAt'] = _iso(now);
    }
    stats['promptsScored'] = (stats['promptsScored'] as int) + 1;
    _emit('feed:update', {
      'roundId': round['roundId'],
      ...item,
      'bestScore': best,
      'expression': expression,
    });
    if (score == 100) {
      slot['slotState'] = 'LOCKED_100';
      stats['unlockedCount'] = (stats['unlockedCount'] as int) + 1;
      final unlocked = [
        for (final x in _slots())
          if (x['slotState'] == 'LOCKED_100') (x['player'] as Json)['label'],
      ];
      _emit('player:unlocked', {'slotNumber': slot['slotNumber'], 'label': p['label'], 'unlocked': unlocked});
      if (demo['tieAt100'] == true && unlocked.length >= 2) demo['tieAt100'] = false;
    }
    _emit('monitor:stats', stats);
  }

  static void _endRound(DateTime now) {
    final s = _session!;
    final round = s['round'] as Json;
    _setPhase('RESULT_PENDING');
    _emit('round:ended', {'roundId': round['roundId'], 'endedAt': _iso(now)});
    s['resultReadyAt'] = _iso(now.add(const Duration(milliseconds: 1500)));
    s['result'] = null;
    _audit('ROUND_ENDED', 'Round ${round['roundNumber']} ended');
  }

  static Json _computeResult() {
    final rows = <Json>[];
    for (final slot in _slots()) {
      final p = slot['player'] as Json?;
      if (p == null) continue;
      rows.add({
        'playerId': p['id'],
        'slotNumber': slot['slotNumber'],
        'label': p['label'],
        'shape': slot['shape'],
        'bestScore': p['bestScore'],
        'decidingSubmissionId': p['decidingSequence'] == null ? null : 'prm_${p['decidingSequence']}',
        'decidingSequence': p['decidingSequence'],
        'decidingReceivedAt': p['decidingReceivedAt'],
      });
    }
    rows.sort((a, b) {
      final sa = a['bestScore'] as int?, sb = b['bestScore'] as int?;
      if (sa == null && sb == null) return '${a['label']}'.compareTo('${b['label']}');
      if (sa == null) return 1;
      if (sb == null) return -1;
      if (sa != sb) return sb.compareTo(sa);
      return (a['decidingSequence'] as int).compareTo(b['decidingSequence'] as int);
    });
    for (var i = 0; i < rows.length; i++) {
      rows[i]['rank'] = i + 1;
    }
    final top = rows.isNotEmpty && rows.first['bestScore'] != null ? rows.first : null;
    String? tie;
    if (top != null && rows.length > 1 && rows[1]['bestScore'] == top['bestScore']) {
      tie = 'Tie on ${top['bestScore']}. ${top['label']} reached it first '
          '(submission #${top['decidingSequence']} before #${rows[1]['decidingSequence']}).';
    }
    return {
      'status': 'PROVISIONAL',
      'winner': top == null
          ? null
          : {'slotNumber': top['slotNumber'], 'label': top['label'], 'shape': top['shape'], 'bestScore': top['bestScore']},
      'ranking': rows,
      'tieBreakExplanation': tie,
      'canConfirm': top != null,
    };
  }

  static void _endSession(String phase, {required bool nextOpened}) {
    final s = _session!;
    _setPhase(phase);
    if (phase == 'DISCARDED') {
      _emit('round:discarded', {'sessionId': s['id'], 'roundId': (s['round'] as Json?)?['roundId']});
    } else {
      _emit('session:closed', {'sessionId': s['id'], 'nextSessionOpened': nextOpened});
    }
    db['session'] = null;
  }

  static Json _openSession(int capacity, int duration) {
    final ev = _event;
    final n = (ev['sessionCounter'] as int) + 1;
    ev['sessionCounter'] = n;
    ev['lastSettings'] = {'capacity': capacity, 'roundDurationSeconds': duration};
    final codes = <String>{};
    while (codes.length < capacity) {
      codes.add((10 + _rng.nextInt(90)).toString());
    }
    const shapes = ['BLUE_CIRCLE', 'RED_SQUARE', 'YELLOW_DIAMOND', 'GREEN_PILL', 'GREEN_CIRCLE'];
    final list = codes.toList();
    db['session'] = {
      'id': 'ses_${n.toString().padLeft(2, '0')}',
      'phase': 'JOINING',
      'capacity': capacity,
      'roundDurationSeconds': duration,
      'joinedCount': 0,
      'createdAt': _iso(clock()),
      'nextJoinAt': _iso(clock().add(Duration(seconds: joinEverySeconds))),
      'slots': [
        for (var i = 0; i < capacity; i++)
          <String, dynamic>{'slotNumber': i + 1, 'code': list[i], 'shape': shapes[i], 'slotState': 'UNJOINED', 'player': null},
      ],
      'treasure': null,
      'round': null,
      'result': null,
    };
    _audit('SESSION_OPENED', 'Session opened - $capacity players - ${duration}s round');
    _emit('session:opened', {'sessionId': _session!['id'], 'capacity': capacity, 'roundDurationSeconds': duration});
    return _sessionCreated();
  }

  static Json _sessionCreated() {
    final s = _session!;
    return {
      'session': _sessionSummary(s),
      'slots': _publicSlots(),
    };
  }

  static Json _sessionSummary(Json s) => {
    'id': s['id'],
    'phase': s['phase'],
    'capacity': s['capacity'],
    'roundDurationSeconds': s['roundDurationSeconds'],
    'joinedCount': s['joinedCount'],
    'createdAt': s['createdAt'],
  };

  static List<Json> _publicSlots() => [
    for (final x in _slots())
      {
        'slotNumber': x['slotNumber'],
        'code': x['code'],
        'shape': x['shape'],
        'slotState': x['slotState'],
        'player': x['player'] == null
            ? null
            : {
                for (final k in ['id', 'label', 'fullName', 'entranceId', 'connection', 'bestScore', 'nameReview'])
                  k: (x['player'] as Json)[k],
              },
      },
  ];

  // ------------------------------------------------------------------ HTTP

  static void _requireAuth(Map headers) {
    final auth = '${headers['Authorization'] ?? headers['authorization'] ?? ''}';
    final token = db['token'];
    if (token == null || auth != 'Bearer $token') {
      throw MockError(401, 'UNAUTHENTICATED', 'Please sign in again.');
    }
  }

  static Json _requireSession(String id, List<String> phases) {
    final s = _session;
    if (s == null || s['id'] != id) throw MockError(404, 'NOT_FOUND', 'Session not found.');
    if (!phases.contains(s['phase'])) {
      throw MockError(409, 'INVALID_PHASE', 'That is not possible in ${s['phase']}.');
    }
    return s;
  }

  static int? _positiveInt(Object? v) {
    if (v is int && v > 0) return v;
    return null;
  }

  /// Answers one request. Returns (status, body); body is a String for CSV.
  static (int, Object?) handle(String method, String path, Map body, Map headers) {
    tick();
    try {
      final result = _route(method, path, body, headers);
      _save();
      return result;
    } on MockError {
      _save();
      rethrow;
    }
  }

  static (int, Object?) _route(String method, String path, Map body, Map headers) {
    final now = clock();
    final seg = path.split('/').where((p) => p.isNotEmpty).toList(); // api, controller, ...
    final key = '$method ${seg.skip(2).join('/')}';

    if (key == 'POST auth/login') {
      final failed = [for (final f in db['failedLogins'] as List) _at(f)]
        ..removeWhere((t) => now.difference(t) > const Duration(minutes: 1));
      db['failedLogins'] = [for (final t in failed) _iso(t)];
      if (failed.length >= 5) throw MockError(429, 'TOO_MANY_ATTEMPTS', 'Too many attempts. Try again in a minute.');
      if (body['username'] != username || body['password'] != password) {
        (db['failedLogins'] as List).add(_iso(now));
        throw MockError(401, 'INVALID_CREDENTIALS', 'Wrong username or password.');
      }
      if (db['token'] != null) _emit('controller:kicked', {'reason': 'SIGNED_IN_ELSEWHERE'});
      final token = 'mock-ctl-${now.microsecondsSinceEpoch}';
      db['token'] = token;
      return (200, {
        'token': token,
        'expiresAt': _iso(now.add(const Duration(hours: 12))),
        'controller': {'id': 'ctl_1', 'username': username},
      });
    }

    _requireAuth(headers);
    final ev = _event;
    final s = _session;

    switch (key) {
      case 'POST auth/logout':
        db['token'] = null;
        return (204, null);

      case 'GET auth/me':
        return (200, {'controller': {'id': 'ctl_1', 'username': username}});

      case 'GET sessions/active':
        return (200, _hydrate());

      case 'POST sessions':
        if (ev['status'] != 'OPEN') throw MockError(409, 'EVENT_CLOSED', 'The event day is closed.');
        if (s != null) throw MockError(409, 'SESSION_ALREADY_ACTIVE', 'A session is already open.');
        final cap = body['capacity'];
        final dur = body.containsKey('roundDurationSeconds') ? _positiveInt(body['roundDurationSeconds']) : 90;
        if ((cap != 4 && cap != 5) || dur == null) {
          throw MockError(422, 'VALIDATION_FAILED', 'Capacity must be 4 or 5 and duration a positive whole number.');
        }
        return (201, _openSession(cap as int, dur));

      case 'GET health/agents':
        final down = demo['agentDown'] == true;
        Json agent(int ms, {bool isDown = false}) =>
            {'status': isDown ? 'DOWN' : 'UP', 'latencyMs': isDown ? null : ms, 'model': 'mock'};
        return (200, {
          'checkedAt': _iso(now),
          'allHealthy': !down,
          'agents': {
            'treasure': agent(820),
            'image': agent(300),
            'filter': agent(400),
            'guard': agent(900, isDown: down),
            'emoji': agent(500),
          },
        });

      case 'GET audit-logs':
        final limit = int.tryParse('${body['limit'] ?? 50}') ?? 50;
        final start = int.tryParse('${body['cursor'] ?? 0}') ?? 0;
        final all = db['audit'] as List;
        final page = all.skip(start).take(limit).toList();
        final next = start + limit < all.length ? '${start + limit}' : null;
        return (200, {'items': page, 'nextCursor': next});

      case 'GET winners/export':
        if (ev['status'] != 'OPEN') throw MockError(409, 'EVENT_CLOSED', 'The event day is closed.');
        final rows = StringBuffer('full_name,entrance_id,round_number,confirmed_at,winning_score,treasure_title,treasure_id\n');
        for (final w in ev['winners'] as List) {
          final m = w as Json;
          rows.writeln([
            m['fullName'], m['entranceId'], m['roundNumber'], m['confirmedAt'], m['score'], '"${m['treasureTitle']}"', m['treasureId'],
          ].join(','));
        }
        ev['csvExportedAt'] = _iso(now);
        ev['csvCovers'] = (ev['winners'] as List).length;
        _audit('CSV_EXPORTED', 'Winners CSV exported - ${ev['csvCovers']} winners');
        return (200, rows.toString());

      case 'POST event/close':
        if (ev['status'] == 'CLOSED') throw MockError(409, 'EVENT_CLOSED', 'The event day is already closed.');
        if (body['confirmation'] != 'CLOSE EVENT') {
          throw MockError(422, 'CONFIRMATION_REQUIRED', 'Type CLOSE EVENT to confirm.');
        }
        if (!_csvUpToDate()) {
          throw MockError(409, 'CSV_NOT_EXPORTED', 'Export a CSV that covers every winner first.');
        }
        if (s != null) {
          // A live round is stopped; any unconfirmed result is lost.
          _endSession('CLOSED', nextOpened: false);
        }
        ev['status'] = 'CLOSING';
        ev['failure'] = null;
        ev['closeDoneAt'] = _iso(now.add(const Duration(seconds: 3)));
        _audit('EVENT_CLOSING', 'Event day close started');
        _emit('event:status', {'status': 'CLOSING', 'failure': null});
        return (202, {'status': 'CLOSING'});

      case 'GET event/status':
        return (200, {'status': ev['status'], 'closedAt': ev['closedAt'], 'failure': ev['failure']});
    }

    // Routes with an id.
    if (seg.length >= 5) {
      final kind = seg[2], id = seg[3], action = seg.sublist(4).join('/');

      if (kind == 'sessions') {
        switch ('$method $action') {
          case 'PATCH duration':
            final sess = _requireSession(id, ['JOINING', 'TREASURE_REVIEW', 'READY']);
            final d = _positiveInt(body['roundDurationSeconds']);
            if (d == null) throw MockError(422, 'VALIDATION_FAILED', 'Duration must be a positive whole number.');
            sess['roundDurationSeconds'] = d;
            ev['lastSettings'] = {'capacity': sess['capacity'], 'roundDurationSeconds': d};
            _audit('DURATION_CHANGED', 'Round length set to ${d}s');
            return (200, {'session': {'id': id, 'roundDurationSeconds': d}});

          case 'POST treasure':
            final sess = _requireSession(id, ['JOINING', 'TREASURE_REVIEW']);
            if (sess['joinedCount'] != sess['capacity']) {
              throw MockError(409, 'PLAYERS_NOT_JOINED', 'Wait until every player has joined.');
            }
            if ((sess['treasure'] as Json?)?['status'] == 'GENERATING') {
              throw MockError(409, 'GENERATION_IN_PROGRESS', 'A treasure is already being generated.');
            }
            if (sess['phase'] == 'JOINING') _setPhase('TREASURE_REVIEW');
            _startGeneration();
            _audit('TREASURE_REQUESTED', 'Treasure generation started');
            return (202, {'candidate': {'candidateId': (sess['treasure'] as Json)['candidateId'], 'status': 'GENERATING'}});

          case 'POST start':
            final sess = _requireSession(id, ['READY']);
            final slots = _slots();
            if (slots.any((x) => x['player'] == null || (x['player'] as Json)['connection'] != 'CONNECTED')) {
              throw MockError(409, 'PLAYERS_NOT_READY', 'A player is missing or disconnected.');
            }
            if (slots.any((x) => (x['player'] as Json)['nameReview'] != 'APPROVED')) {
              throw MockError(409, 'NAMES_NOT_REVIEWED', 'Review every name first.');
            }
            if ((sess['treasure'] as Json?)?['status'] != 'APPROVED') {
              throw MockError(409, 'TREASURE_NOT_APPROVED', 'Approve a treasure first.');
            }
            if (demo['agentDown'] == true) {
              throw MockError(503, 'AGENTS_UNAVAILABLE', 'The guard agent is down.');
            }
            final n = (ev['roundCounter'] as int) + 1;
            ev['roundCounter'] = n;
            final dur = sess['roundDurationSeconds'] as int;
            final round = <String, dynamic>{
              'roundId': 'rnd_$n',
              'roundNumber': n,
              'durationSeconds': dur,
              'startedAt': _iso(now),
              'roundEndAt': _iso(now.add(Duration(seconds: dur))),
              'sequence': 0,
              'approved': <Json>[],
              'errors': <Json>[],
              'stats': <String, dynamic>{'promptsScored': 0, 'unlockedCount': 0, 'blockedCount': 0, 'agentErrors': 0},
              'nextPromptAt': _iso(now.add(const Duration(seconds: 2))),
            };
            sess['round'] = round;
            _setPhase('PLAYING');
            final t = sess['treasure'] as Json;
            _audit('ROUND_STARTED', 'Round $n started - ${t['title']}');
            final payload = {
              'roundId': round['roundId'],
              'roundNumber': n,
              'durationSeconds': dur,
              'startedAt': round['startedAt'],
              'roundEndAt': round['roundEndAt'],
              'serverNow': _iso(now),
            };
            _emit('round:started', {
              ...payload,
              'treasure': {
                'treasureId': t['candidateId'],
                'title': t['title'],
                'backstory': t['backstory'],
                'lockObjective': t['lockObjective'],
                'imageUrl': t['imageUrl'],
              },
            });
            return (200, {'round': payload});

          case 'POST close':
            final sess = _requireSession(id, ['JOINING', 'TREASURE_REVIEW', 'READY', 'RESULTS']);
            final reason = '${body['reason'] ?? ''}'.trim();
            if (sess['phase'] != 'RESULTS' && reason.isEmpty) {
              throw MockError(422, 'REASON_REQUIRED', 'Give a reason.');
            }
            final wasResults = sess['phase'] == 'RESULTS';
            _audit(
              wasResults ? 'SESSION_CLOSED' : 'SESSION_ABANDONED',
              wasResults ? 'Session closed' : 'Session abandoned',
              reason: reason.isEmpty ? null : reason,
            );
            _endSession('CLOSED', nextOpened: false);
            return (200, {'session': {'id': id, 'phase': 'CLOSED'}});

          case 'POST next-group':
            final key = '${headers['Idempotency-Key'] ?? ''}';
            if (key.isEmpty) throw MockError(400, 'IDEMPOTENCY_KEY_REQUIRED', 'Missing Idempotency-Key.');
            final seen = (db['idempotency'] as Map)[key];
            if (seen != null) return (201, seen);
            final sess = _requireSession(id, ['RESULTS']);
            _audit('SESSION_CLOSED', 'Session closed - next group');
            _endSession('CLOSED', nextOpened: true);
            final opened = _openSession(sess['capacity'] as int, sess['roundDurationSeconds'] as int);
            final res = {'closedSessionId': id, ...opened};
            (db['idempotency'] as Map)[key] = res;
            return (201, res);
        }
      }

      if (kind == 'treasure') {
        final sess = s;
        final cand = sess?['treasure'] as Json?;
        if (sess == null || cand == null || cand['candidateId'] != id) {
          throw MockError(404, 'NOT_FOUND', 'Treasure not found.');
        }
        if (sess['phase'] != 'TREASURE_REVIEW') throw MockError(409, 'INVALID_PHASE', 'Not in treasure review.');
        if (method == 'POST' && action == 'approve') {
          if (cand['status'] != 'READY') throw MockError(409, 'CANDIDATE_NOT_READY', 'The treasure is not ready yet.');
          cand['status'] = 'APPROVED';
          _setPhase('READY');
          _audit('TREASURE_APPROVED', 'Treasure approved - ${cand['title']}');
          return (200, {'session': {'id': sess['id'], 'phase': 'READY'}, 'treasure': {'candidateId': id, 'status': 'APPROVED'}});
        }
        if (method == 'POST' && action == 'reject') {
          _audit('TREASURE_REJECTED', 'Treasure rejected - ${cand['title'] ?? id}');
          _startGeneration();
          return (202, {
            'rejectedCandidateId': id,
            'candidate': {'candidateId': (sess['treasure'] as Json)['candidateId'], 'status': 'GENERATING'},
          });
        }
      }

      if (kind == 'rounds') {
        final round = s?['round'] as Json?;
        if (s == null || round == null || round['roundId'] != id) {
          throw MockError(404, 'NOT_FOUND', 'Round not found.');
        }
        switch ('$method $action') {
          case 'GET monitor':
            return (200, {
              'round': {'roundId': id, 'roundNumber': round['roundNumber'], 'roundEndAt': round['roundEndAt'], 'serverNow': _iso(now)},
              'stats': round['stats'],
              'approvedPrompts': [
                for (final a in round['approved'] as List) Map.of(a as Json)..remove('receivedAt'),
              ],
              'errors': round['errors'],
            });

          case 'GET result':
            final r = s['result'] as Json?;
            if (r == null) throw MockError(409, 'RESULT_NOT_READY', 'The result is still being calculated.');
            return (200, r);

          case 'POST confirm':
            final r = s['result'] as Json?;
            if (s['phase'] == 'RESULTS' && r != null) {
              return (200, {
                'result': {'status': 'CONFIRMED', 'roundNumber': round['roundNumber'], 'confirmedAt': r['confirmedAt']},
                'session': {'phase': 'RESULTS'},
              });
            }
            if (s['phase'] != 'RESULT_PENDING' || r == null) throw MockError(409, 'INVALID_PHASE', 'No result to confirm.');
            if (r['canConfirm'] != true) throw MockError(409, 'NO_WINNER', 'Nobody scored. Discard the round.');
            r['status'] = 'CONFIRMED';
            r['confirmedAt'] = _iso(now);
            final w = r['winner'] as Json;
            final slot = _slots().firstWhere((x) => x['slotNumber'] == w['slotNumber']);
            final p = slot['player'] as Json;
            final t = s['treasure'] as Json;
            (ev['winners'] as List).add({
              'roundNumber': round['roundNumber'],
              'fullName': p['fullName'],
              'entranceId': p['entranceId'],
              'score': w['bestScore'],
              'confirmedAt': r['confirmedAt'],
              'treasureTitle': t['title'],
              'treasureId': t['candidateId'],
            });
            _setPhase('RESULTS');
            _audit('RESULT_CONFIRMED', 'Winner confirmed - ${w['label']} (${w['bestScore']})');
            _emit('result:confirmed', {
              'roundId': id,
              'roundNumber': round['roundNumber'],
              'winner': w,
              'ranking': r['ranking'],
              'tieBreakExplanation': r['tieBreakExplanation'],
            });
            return (200, {
              'result': {'status': 'CONFIRMED', 'roundNumber': round['roundNumber'], 'confirmedAt': r['confirmedAt']},
              'session': {'phase': 'RESULTS'},
            });

          case 'POST discard':
            final reason = '${body['reason'] ?? ''}'.trim();
            if (reason.isEmpty) throw MockError(422, 'REASON_REQUIRED', 'Give a reason.');
            if (s['phase'] != 'RESULT_PENDING') throw MockError(409, 'INVALID_PHASE', 'Only a pending result can be discarded.');
            _audit('ROUND_DISCARDED', 'Round ${round['roundNumber']} discarded', reason: reason);
            _endSession('DISCARDED', nextOpened: false);
            return (200, {'session': {'id': s['id'], 'phase': 'DISCARDED'}});
        }
      }

      if (kind == 'players' && method == 'POST' && action == 'name-review') {
        final slot = _slots().where((x) => (x['player'] as Json?)?['id'] == id).firstOrNull;
        if (slot == null) throw MockError(404, 'NOT_FOUND', 'Player not found.');
        if (!['JOINING', 'TREASURE_REVIEW', 'READY'].contains(s!['phase'])) {
          throw MockError(409, 'INVALID_PHASE', 'Names are locked once the round starts.');
        }
        final p = slot['player'] as Json;
        if (body['decision'] == 'RENAMED') {
          final name = '${body['fullName'] ?? ''}'.trim();
          if (name.isEmpty) throw MockError(422, 'NAME_REQUIRED', 'Type the replacement name.');
          final old = p['label'];
          p['fullName'] = name;
          p['label'] = name.split(' ').first;
          _audit('NAME_RENAMED', 'Name replaced - slot ${slot['slotNumber']} ($old to ${p['label']})');
        } else {
          _audit('NAME_APPROVED', 'Name approved - ${p['label']}');
        }
        p['nameReview'] = 'APPROVED';
        final all = _slots().every((x) => (x['player'] as Json?)?['nameReview'] == 'APPROVED') &&
            s['joinedCount'] == s['capacity'];
        if (all) {
          _emit('players:revealed', {
            'players': [
              for (final x in _slots())
                {
                  'slotNumber': x['slotNumber'],
                  'label': (x['player'] as Json)['label'],
                  'shape': x['shape'],
                  'connection': (x['player'] as Json)['connection'],
                },
            ],
          });
        }
        return (200, {'player': {'id': id, 'label': p['label'], 'nameReview': 'APPROVED'}, 'allApproved': all});
      }
    }

    throw MockError(404, 'NOT_FOUND', 'Not found in mock: $method $path');
  }

  static bool _csvUpToDate() {
    final ev = _event;
    return ev['csvExportedAt'] != null && ev['csvCovers'] == (ev['winners'] as List).length;
  }

  static Json _hydrate() {
    final ev = _event;
    final s = _session;
    final t = s?['treasure'] as Json?;
    final round = s?['round'] as Json?;
    return {
      'serverNow': _iso(clock()),
      'eventDay': {
        'id': ev['id'],
        'status': ev['status'],
        'confirmedCount': (ev['winners'] as List).length,
        'csvExportedAt': ev['csvExportedAt'],
        'csvUpToDate': _csvUpToDate(),
        'lastSettings': ev['lastSettings'],
        'winners': [
          for (final w in ev['winners'] as List)
            {'roundNumber': (w as Json)['roundNumber'], 'fullName': w['fullName'], 'score': w['score']},
        ],
      },
      'session': s == null ? null : _sessionSummary(s),
      'slots': s == null ? <Json>[] : _publicSlots(),
      'treasure': t == null
          ? null
          : {
              for (final k in ['candidateId', 'status', 'title', 'backstory', 'lockObjective', 'imageUrl', 'filterPassed', 'rubric', 'stage', 'retryable'])
                if (t[k] != null) k: t[k],
            },
      'round': round == null
          ? null
          : {
              for (final k in ['roundId', 'roundNumber', 'durationSeconds', 'startedAt', 'roundEndAt']) k: round[k],
            },
      'audit': [
        for (final a in (db['audit'] as List).take(20)) {'at': (a as Json)['at'], 'summary': a['summary']},
      ],
    };
  }
}
