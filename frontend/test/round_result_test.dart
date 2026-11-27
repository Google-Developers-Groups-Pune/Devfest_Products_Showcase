import 'package:flutter_test/flutter_test.dart';
import 'package:prompt_heist/core/result/round_result.dart';

void main() {
  test('parses a confirmed result, ranking sorted by rank', () {
    final r = RoundResult.fromJson({
      'status': 'CONFIRMED',
      'roundNumber': 1,
      'myRank': 2,
      'winner': {'slotNumber': 3, 'label': 'Dev', 'shape': 'YELLOW_DIAMOND', 'bestScore': 100},
      'ranking': [
        {'rank': 2, 'slotNumber': 1, 'label': 'Isha', 'shape': 'BLUE_CIRCLE', 'bestScore': 88},
        {'rank': 1, 'slotNumber': 3, 'label': 'Dev', 'shape': 'YELLOW_DIAMOND', 'bestScore': 100},
        {'rank': 3, 'slotNumber': 2, 'label': 'Meera', 'shape': 'RED_SQUARE', 'bestScore': null},
      ],
      'tieBreakExplanation': null,
      'story': {'title': 'The Saffron Vault', 'backstory': 'Long ago…', 'imageUrl': 'https://x/y.png'},
    });
    expect(r.confirmed, isTrue);
    expect(r.ranking.map((p) => p.label), ['Dev', 'Isha', 'Meera']);
    expect(r.atRank(r.myRank!)!.bestScore, 88);
    expect(r.ranking.last.bestScore, isNull);
    expect(r.winner!.shape, 'YELLOW_DIAMOND');
    expect(r.story!.title, 'The Saffron Vault');
  });

  test('a pending or provisional result is not confirmed', () {
    expect(RoundResult.fromJson({'status': 'PENDING'}).confirmed, isFalse);
    final p = RoundResult.fromJson({
      'status': 'PROVISIONAL',
      'winner': {'label': 'Isha', 'shape': 'BLUE_CIRCLE', 'bestScore': 92},
    });
    expect(p.confirmed, isFalse);
    expect(p.winner!.label, 'Isha');
    expect(p.ranking, isEmpty);
  });
}
