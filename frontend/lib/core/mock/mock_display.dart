import 'dart:async';

/// Mock only: a scripted show for the audience screen, played in a loop.
///
/// Idle, session opened, five joins (counts only), names revealed together,
/// treasure review, ready, a 60 second battle with a live feed, a disconnect,
/// two unlocks, round ended, result confirmed, session closed, next group.
///
/// The mock `GET /api/display/state` and the mock `/display` socket both read
/// from here, so a refresh or reconnect mid-show lands on the right screen.
///
/// Jump ahead with `/audience?start=JOINING` (or `TREASURE_REVIEW`, `PLAYING`,
/// `RESULT_PENDING`).
class MockDisplay {
  static const roundSeconds = 60;
  static const joinUrl = 'heist.devfestpune.dev';

  static const treasure = {
    'treasureId': 'cnd_2',
    'title': 'The Saffron Vault',
    'backstory':
        'Legend says a merchant hid a vault of saffron beneath old Pune during '
        'the 1800s monsoon. Its guard only opens up for well-crafted words. '
        '(A simulated treasure.)',
    'lockObjective':
        'Ask for a polite, 3-line monsoon poem about Pune that mentions the '
        'vault and ends with a question.',
    'imageUrl': '',
  };

  static const _players = [
    (1, 'Isha', 'BLUE_CIRCLE'),
    (2, 'Meera (Player 2)', 'RED_SQUARE'),
    (3, 'Kabir', 'YELLOW_DIAMOND'),
    (4, 'Zoya', 'GREEN_PILL'),
    (5, 'Meera (Player 5)', 'GREEN_CIRCLE'),
  ];

  // (slot, prompt, score, reaction, expression). Includes a full 200 character
  // prompt and a 100 character reaction, to prove nothing is cut off.
  static const _feed = [
    (3, 'Write a poem about Pune.', 34, 'Thoda aur try karo, boss! 🙃', 'BORED'),
    (1, 'Kindly compose 3 lines on the Pune monsoon and the vault.', 48, 'Guard ne ek aankh kholi 👀', 'CURIOUS'),
    (2, 'Give me a rhyme about rain, chai, and secret treasure under the city.', 52, 'Hmm, chai ka zikr? Interesting 🤨', 'CURIOUS'),
    (5, 'Could you kindly write three lines about the Pune rain?', 41, 'Baarish toh hai, vault kahan hai? 😒', 'UNIMPRESSED'),
    (4, 'open the vault now', 7, 'Itna seedha? Guard so gaya 🥱', 'BORED'),
    (3, 'Please write a polite three line poem about the monsoon over Pune, mentioning the saffron vault hidden below the old city, and end the last line with a gentle question for the guard to answer.', 73, 'Arre wah, poori kavita! Guard ne chashma pehna, dhyan se padh raha hai, aur muskura bhi raha hai 😮', 'IMPRESSED'),
    (1, 'Write a polite 3-line poem about the Pune rain and the saffron vault, ending with a question.', 88, 'Vault hil raha hai! 😱', 'SHOCKED'),
    (2, 'A short poem about Pune monsoon and the vault, please, with a question at the end.', 83, 'Guard impressed lag raha hai 🤩', 'IMPRESSED'),
    (5, 'Kindly compose 3 lines on the Pune monsoon, the vault, and end with a question?', 79, 'Bas thoda sa aur! 🔥', 'IMPRESSED'),
    (1, 'Kindly write a polite 3-line monsoon poem about Pune that mentions the vault and ends with a question.', 100, 'Guard ne salute maara! 🫡', 'SALUTE'),
    (4, 'Describe the vault in the rain as a poem.', 54, 'Garam ho raha hai mamla! 🔥', 'CURIOUS'),
    (5, 'Please, a polite three-line Pune monsoon poem about the vault, ending in a question?', 100, 'Guard ne salute maara! 🫡', 'SALUTE'),
    (2, 'Three polite lines: Pune rain, saffron vault, and a question to close.', 91, 'Bilkul paas! 😱', 'SHOCKED'),
    (3, 'Rain on Pune roofs, a vault below, will you open?', 66, 'Achha hai, par polite kahan hai? 😐', 'NEUTRAL'),
  ];

  static final events = StreamController<(String, Object?)>.broadcast(
    onListen: _start,
    onCancel: _stop,
  );

  static String phase = 'SETUP';
  static int joinedCount = 0;
  static bool revealed = false;
  static DateTime? roundEnd;
  static final _rows = <int, Map<String, dynamic>>{};
  static final _unlocked = <String>[];
  static Map<String, dynamic>? _result;

  static final _timers = <Timer>[];
  static Timer? _sync;
  static int _session = 0;

  static String get _sessionId => 'ses_$_session';
  static String _now() => DateTime.now().toUtc().toIso8601String();

  static void _emit(String event, Map<String, dynamic> data) =>
      events.add((event, data));

  static void _start() {
    final start = Uri.base.queryParameters['start'];
    _runShow(skipTo: start);
  }

  static void _stop() {
    for (final t in _timers) {
      t.cancel();
    }
    _timers.clear();
    _sync?.cancel();
    _sync = null;
  }

  static List<Map<String, dynamic>> _publicPlayers() => [
    for (final p in _players)
      {
        'slotNumber': p.$1,
        'label': p.$2,
        'shape': p.$3,
        'connection': _rows[p.$1]?['connection'] ?? 'CONNECTED',
        'state': _rows[p.$1]?['state'] ?? 'LOBBY',
        'bestScore': _rows[p.$1]?['bestScore'],
        'latest': _rows[p.$1]?['latest'],
      },
  ];

  /// GET /api/display/state
  static Map<String, dynamic> state() {
    final end = roundEnd;
    final open = phase != 'SETUP';
    return {
      'serverNow': _now(),
      'phase': phase,
      'joinUrl': joinUrl,
      'session': open ? {'capacity': 5, 'joinedCount': joinedCount} : null,
      'players': revealed ? _publicPlayers() : <Object>[],
      'treasure': end == null ? null : treasure,
      'round': end == null
          ? null
          : {
              'roundId': 'rnd_$_session',
              'roundNumber': 1,
              'durationSeconds': roundSeconds,
              'roundEndAt': end.toIso8601String(),
            },
      'unlocked': List.of(_unlocked),
      'result': _result,
    };
  }

  // ---------------- the show ----------------

  static void _runShow({String? skipTo}) {
    _stop();
    final steps = <(double, String?, void Function())>[];
    var t = 0.0;
    // [mark] names the phase this step enters, for ?start=.
    void at(double gap, void Function() fn, [String? mark]) {
      t += gap;
      steps.add((t, mark, fn));
    }

    at(0, _reset);
    at(5, _openSession, 'JOINING');
    for (var n = 1; n <= 5; n++) {
      at(2, () => _join(n));
    }
    at(2, _reveal);
    at(2, () => _phase('TREASURE_REVIEW'), 'TREASURE_REVIEW');
    at(5, () => _phase('READY'));
    at(3, _startRound, 'PLAYING');
    final roundStart = t;
    var feedAt = roundStart + 2;
    for (final f in _feed) {
      steps.add((feedAt, null, () => _feedUpdate(f)));
      feedAt += 3.2;
    }
    steps.add((roundStart + 18, null, () => _connection(4, 'DISCONNECTED')));
    steps.add((roundStart + 30, null, () => _connection(4, 'CONNECTED')));
    t = roundStart + roundSeconds;
    at(0, _endRound, 'RESULT_PENDING');
    at(5, _confirm);
    at(12, _close);
    // nextSessionOpened: the next group starts joining straight away.
    at(3, () => _runShow(skipTo: 'JOINING'));

    steps.sort((a, b) => a.$1.compareTo(b.$1));

    // Fast-forward: run everything before the requested phase at once.
    var offset = 0.0;
    if (skipTo != null) {
      final i = steps.indexWhere((s) => s.$2 == skipTo);
      if (i > 0) {
        offset = steps[i].$1;
        for (final s in steps.take(i)) {
          s.$3();
        }
        steps.removeRange(0, i);
        // Rounds that started in the past keep their real end time.
      }
    }
    for (final s in steps) {
      final ms = ((s.$1 - offset) * 1000).round();
      _timers.add(Timer(Duration(milliseconds: ms), s.$3));
    }
  }

  static void _reset() {
    phase = 'SETUP';
    joinedCount = 0;
    revealed = false;
    roundEnd = null;
    _rows.clear();
    _unlocked.clear();
    _result = null;
    _sync?.cancel();
  }

  static void _phase(String next) {
    final prev = phase;
    phase = next;
    _emit('phase:changed', {
      'sessionId': _sessionId,
      'phase': next,
      'previousPhase': prev,
      'at': _now(),
    });
  }

  static void _openSession() {
    _session++;
    _reset();
    phase = 'JOINING';
    _emit('session:opened', {
      'sessionId': _sessionId,
      'capacity': 5,
      'roundDurationSeconds': roundSeconds,
    });
  }

  static void _join(int n) {
    joinedCount = n;
    // The display gets counts only, never names, until players:revealed.
    _emit('player:joined', {'joinedCount': n, 'capacity': 5});
  }

  static void _reveal() {
    revealed = true;
    _emit('players:revealed', {'players': _publicPlayers()});
  }

  static void _startRound() {
    final now = DateTime.now().toUtc();
    roundEnd = now.add(const Duration(seconds: roundSeconds));
    for (final p in _players) {
      _rows[p.$1] = {'state': 'PLAYING', 'connection': 'CONNECTED'};
    }
    phase = 'PLAYING';
    _emit('round:started', {
      'roundId': 'rnd_$_session',
      'roundNumber': 1,
      'durationSeconds': roundSeconds,
      'startedAt': now.toIso8601String(),
      'roundEndAt': roundEnd!.toIso8601String(),
      'serverNow': now.toIso8601String(),
      'treasure': treasure,
    });
    _sync = Timer.periodic(const Duration(seconds: 3), (_) {
      if (phase != 'PLAYING' || roundEnd == null) return;
      _emit('timer:sync', {
        'roundId': 'rnd_$_session',
        'roundEndAt': roundEnd!.toIso8601String(),
        'serverNow': _now(),
      });
    });
  }

  static int _seq = 0;

  static void _feedUpdate((int, String, int, String, String) f) {
    final (slot, text, score, reaction, expression) = f;
    final row = _rows[slot];
    if (phase != 'PLAYING' || row == null || row['state'] == 'LOCKED_100') {
      return;
    }
    final best = row['bestScore'] as int?;
    final newBest = best == null || score > best ? score : best;
    row['bestScore'] = newBest;
    row['latest'] = {
      'text': text,
      'reaction': reaction,
      'expression': expression,
    };
    final p = _players.firstWhere((p) => p.$1 == slot);
    _emit('feed:update', {
      'roundId': 'rnd_$_session',
      'sequence': ++_seq,
      'slotNumber': slot,
      'label': p.$2,
      'shape': p.$3,
      'text': text,
      'score': score,
      'bestScore': newBest,
      'reaction': reaction,
      'expression': expression,
    });
    if (score == 100) {
      row['state'] = 'LOCKED_100';
      _unlocked.add(p.$2);
      _emit('player:unlocked', {
        'slotNumber': slot,
        'label': p.$2,
        'unlocked': List.of(_unlocked),
      });
    }
  }

  static void _connection(int slot, String connection) {
    final row = _rows[slot];
    if (row == null) return;
    row['connection'] = connection;
    final p = _players.firstWhere((p) => p.$1 == slot);
    _emit('player:connection', {
      'slotNumber': slot,
      'label': p.$2,
      'connection': connection,
    });
  }

  static void _endRound() {
    _sync?.cancel();
    phase = 'RESULT_PENDING';
    _emit('round:ended', {'roundId': 'rnd_$_session', 'endedAt': _now()});
  }

  static void _confirm() {
    final ranked = _publicPlayers()
      ..sort(
        (a, b) => ((b['bestScore'] as int?) ?? -1).compareTo(
          (a['bestScore'] as int?) ?? -1,
        ),
      );
    final ranking = [
      for (var i = 0; i < ranked.length; i++)
        {
          'rank': i + 1,
          'slotNumber': ranked[i]['slotNumber'],
          'label': ranked[i]['label'],
          'shape': ranked[i]['shape'],
          'bestScore': ranked[i]['bestScore'],
        },
    ];
    final winner = Map<String, dynamic>.from(ranking.first)..remove('rank');
    _result = {
      'roundNumber': 1,
      'winner': winner,
      'ranking': ranking,
      'tieBreakExplanation':
          'Isha and Meera (Player 5) both reached 100. Isha got there first.',
    };
    phase = 'RESULTS';
    _emit('result:confirmed', {'roundId': 'rnd_$_session', ..._result!});
  }

  static void _close() {
    phase = 'CLOSED';
    _emit('session:closed', {
      'sessionId': _sessionId,
      'nextSessionOpened': true,
    });
  }
}
