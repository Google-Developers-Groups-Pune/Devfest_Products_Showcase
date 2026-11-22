import 'package:flutter_test/flutter_test.dart';
import 'package:prompt_heist/features/audience/audience_battle.dart';
import 'package:prompt_heist/features/audience/audience_shell.dart';
import 'package:prompt_heist/features/audience/audience_state.dart';

Map<String, dynamic> _player(int slot, String label, {int? best}) => {
  'slotNumber': slot,
  'label': label,
  'shape': slotShapes[slot],
  'connection': 'CONNECTED',
  'state': 'PLAYING',
  'bestScore': best,
};

void main() {
  final revealed = const AudienceState(ready: true, phase: 'JOINING').apply(
    'players:revealed',
    {
      'players': [
        _player(2, 'Meera (Player 2)'),
        _player(1, 'Isha'),
        _player(5, 'Meera (Player 5)'),
      ],
    },
  );

  test('hydrate reads the public display state', () {
    final s = AudienceState.fromHydrate({
      'phase': 'PLAYING',
      'joinUrl': 'heist.devfestpune.dev',
      'session': {'capacity': 5, 'joinedCount': 5},
      'players': [
        {
          ..._player(1, 'Isha', best: 100),
          'state': 'LOCKED_100',
          'latest': {
            'text': 'Write a polite poem',
            'reaction': 'Guard ne salute maara!',
            'expression': 'SALUTE',
          },
        },
      ],
      'treasure': {'title': 'The Saffron Vault', 'imageUrl': ''},
      'unlocked': ['Isha'],
    });
    expect(s.phase, 'PLAYING');
    expect(s.joinUrl, 'heist.devfestpune.dev');
    expect(s.players.single.unlocked, isTrue);
    expect(s.players.single.expression, 'SALUTE');
    expect(s.treasure!.title, 'The Saffron Vault');
    expect(s.unlocked, ['Isha']);
  });

  test('SETUP hydrate with no session shows nothing from a game', () {
    final s = AudienceState.fromHydrate({'phase': 'SETUP', 'session': null});
    expect(s.joinedCount, 0);
    expect(s.players, isEmpty);
    expect(s.treasure, isNull);
  });

  test('player:joined updates the count but never shows names', () {
    final s = const AudienceState(ready: true, phase: 'JOINING').apply(
      'player:joined',
      {
        'joinedCount': 3,
        'capacity': 5,
        'players': [_player(1, 'Isha')], // must be ignored
      },
    );
    expect(s.joinedCount, 3);
    expect(s.players, isEmpty);
  });

  test('players:revealed shows all names at once, in slot order', () {
    expect(revealed.players.map((p) => p.slotNumber), [1, 2, 5]);
    expect(revealed.revealed, isTrue);
  });

  test('session:opened goes back to joining with nothing left over', () {
    final s = revealed
        .apply('round:started', {
          'treasure': {'title': 'Old'},
        })
        .apply('session:opened', {'sessionId': 'ses_2', 'capacity': 5});
    expect(s.phase, 'JOINING');
    expect(s.players, isEmpty);
    expect(s.treasure, isNull);
    expect(s.unlocked, isEmpty);
    expect(s.joinedCount, 0);
  });

  test('feed:update sets the latest prompt, reaction, face and best', () {
    final s = revealed
        .apply('round:started', {'treasure': {'title': 'Vault'}})
        .apply('feed:update', {
          'slotNumber': 2,
          'text': 'A poem please',
          'score': 45,
          'bestScore': 45,
          'reaction': 'Hmm 🤨',
          'expression': 'CURIOUS',
        })
        .apply('feed:update', {
          'slotNumber': 2,
          'text': 'Another one',
          'score': 30,
          'bestScore': 45,
          'reaction': null, // reaction failed (D49)
          'expression': 'NEUTRAL',
        });
    final p = s.players.firstWhere((p) => p.slotNumber == 2);
    expect(p.text, 'Another one');
    expect(p.reaction, isNull);
    expect(p.expression, 'NEUTRAL');
    expect(p.bestScore, 45);
    expect(p.feedCount, 2);
  });

  test('two unlocks in a row: rows turn green and the banner lists both', () {
    final s = revealed
        .apply('player:unlocked', {
          'slotNumber': 1,
          'label': 'Isha',
          'unlocked': ['Isha'],
        })
        .apply('player:unlocked', {
          'slotNumber': 5,
          'label': 'Meera (Player 5)',
          'unlocked': ['Isha', 'Meera (Player 5)'],
        });
    expect(s.players.where((p) => p.unlocked).length, 2);
    expect(
      unlockBanner(s.unlocked),
      'Isha, Meera (Player 5) unlocked the treasure! '
      'The winner is still decided when the timer hits 00:00.',
    );
  });

  test('player:connection marks a row disconnected', () {
    final s = revealed.apply('player:connection', {
      'slotNumber': 2,
      'connection': 'DISCONNECTED',
    });
    expect(s.players.firstWhere((p) => p.slotNumber == 2).disconnected, isTrue);
  });

  test('rows sort by best score, then slot', () {
    final rows = rankedRows([
      AudiencePlayer.fromJson(_player(1, 'A', best: 40)),
      AudiencePlayer.fromJson(_player(2, 'B')),
      AudiencePlayer.fromJson(_player(3, 'C', best: 90)),
      AudiencePlayer.fromJson(_player(4, 'D', best: 40)),
    ]);
    expect(rows.map((r) => r.slotNumber), [3, 1, 4, 2]);
  });

  test('the "(Player 5)" suffix is split off so it is never cut', () {
    expect(splitLabel('Meera (Player 5)'), ('Meera', '(Player 5)'));
    expect(splitLabel('Isha'), ('Isha', null));
  });

  test('the router is driven by phase alone', () {
    expect(screenFor('SETUP'), AudienceScreen.idle);
    expect(screenFor('JOINING'), AudienceScreen.joining);
    expect(screenFor('TREASURE_REVIEW'), AudienceScreen.getReady);
    expect(screenFor('READY'), AudienceScreen.getReady);
    expect(screenFor('PLAYING'), AudienceScreen.battle);
    expect(screenFor('RESULT_PENDING'), AudienceScreen.results);
    expect(screenFor('RESULTS'), AudienceScreen.results);
    expect(screenFor('DISCARDED'), AudienceScreen.idle);
    expect(screenFor('CLOSED'), AudienceScreen.idle);
  });
}
