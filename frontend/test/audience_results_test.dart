import 'package:flutter_test/flutter_test.dart';
import 'package:material_ui/material_ui.dart';

import 'package:prompt_heist/features/audience/audience_results.dart';
import 'package:prompt_heist/features/audience/audience_state.dart';

/// FE-23: the audience result screens.
void main() {
  Future<void> pumpStage(WidgetTester tester, Widget child) async {
    tester.view.physicalSize = const Size(1920, 1080);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(MaterialApp(home: Scaffold(body: SizedBox(width: 1920, height: 1080, child: child))));
    await tester.pump(const Duration(milliseconds: 100));
  }

  const ranking = [
    {'rank': 1, 'slotNumber': 1, 'label': 'Isha', 'shape': 'BLUE_CIRCLE', 'bestScore': 100},
    {'rank': 2, 'slotNumber': 5, 'label': 'Meera (Player 5)', 'shape': 'GREEN_CIRCLE', 'bestScore': 100},
    {'rank': 3, 'slotNumber': 3, 'label': 'Kabir', 'shape': 'YELLOW_DIAMOND', 'bestScore': 91},
    {'rank': 4, 'slotNumber': 2, 'label': 'Dev', 'shape': 'RED_SQUARE', 'bestScore': 54},
    {'rank': 5, 'slotNumber': 4, 'label': 'Zoya', 'shape': 'GREEN_PILL', 'bestScore': null},
  ];

  testWidgets('time up while the result is calculated', (tester) async {
    await pumpStage(tester, const AudienceResults(state: AudienceState(ready: true, phase: 'RESULT_PENDING')));
    expect(find.text("Time's up!"), findsOneWidget);
    expect(find.text('Calculating results…'), findsOneWidget);
  });

  testWidgets('result:provisional shows the winner marked as pending', (tester) async {
    final s = const AudienceState(ready: true, phase: 'PLAYING').apply('result:provisional', {
      'roundId': 'rnd_1',
      'winner': {'slotNumber': 1, 'label': 'Isha', 'shape': 'BLUE_CIRCLE', 'bestScore': 100},
    });
    expect(s.phase, 'RESULT_PENDING');
    await pumpStage(tester, AudienceResults(state: s));
    expect(find.text('Isha'), findsOneWidget);
    expect(find.text('100 points'), findsOneWidget);
    expect(find.textContaining('waiting for the booth to confirm'), findsOneWidget);
  });

  testWidgets('confirmed: winner, tie-break line, every player ranked, story card', (tester) async {
    final s = const AudienceState(
      ready: true,
      treasure: AudienceTreasure(title: 'The Saffron Vault', lockObjective: '', backstory: 'Legend says…', imageUrl: ''),
    ).apply('result:confirmed', {
      'roundId': 'rnd_1',
      'winner': ranking.first,
      'ranking': ranking,
      'tieBreakExplanation': 'Tie on 100. Isha reached it first.',
    });
    await pumpStage(tester, AudienceResults(state: s));
    expect(find.text('Isha wins!'), findsOneWidget);
    expect(find.text('Tie on 100. Isha reached it first.'), findsOneWidget);
    for (final r in ranking) {
      expect(find.text(r['label']! as String), findsOneWidget);
    }
    expect(find.text('The story of The Saffron Vault'), findsOneWidget);
    expect(find.text('Guard agent'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('discarded never shows a reason', (tester) async {
    await pumpStage(tester, const DiscardedScreen());
    expect(find.text('This round was cancelled'), findsOneWidget);
    expect(find.textContaining('reason'), findsNothing);
  });
}
