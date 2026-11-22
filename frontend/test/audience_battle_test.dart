import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:material_ui/material_ui.dart';
import 'package:prompt_heist/features/audience/audience_battle.dart';
import 'package:prompt_heist/features/audience/audience_state.dart';
import 'package:prompt_heist/features/audience/audience_style.dart';

// The worst case from FE-21: five rows of full 200-character prompts and
// 100-character reactions must fit on the 1080p stage with no overflow.
final _prompt200 = ('Please write a polite three line poem about the monsoon '
        'over Pune, mention the saffron vault hidden below the old city, and '
        'end the last line with a gentle question for the guard to answer now.')
    .padRight(200, '.')
    .substring(0, 200);
final _reaction100 = 'Arre wah, poori kavita! Guard ne chashma pehna, dhyan se '
        'padh raha hai, aur muskura raha hai 😮'
    .padRight(100, '!');

void main() {
  testWidgets('five full-length rows fit with nothing cut off', (tester) async {
    tester.view.physicalSize = const Size(Stage.width, Stage.height);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);

    final labels = ['Isha', 'Meera (Player 2)', 'Kabir', 'Zoya', 'Meera (Player 5)'];
    var state = AudienceState.fromHydrate({
      'phase': 'PLAYING',
      'treasure': {
        'title': 'The Saffron Vault',
        'lockObjective': 'Ask for a polite, 3-line monsoon poem about Pune.',
        'backstory': 'Legend says a merchant hid a vault of saffron.',
        'imageUrl': '',
      },
      'players': [
        for (var i = 0; i < 5; i++)
          {
            'slotNumber': i + 1,
            'label': labels[i],
            'shape': slotShapes[i + 1],
            'connection': i == 3 ? 'DISCONNECTED' : 'CONNECTED',
            'state': 'PLAYING',
            'bestScore': 20 * i,
            'latest': {
              'text': _prompt200,
              'reaction': _reaction100,
              'expression': 'CURIOUS',
            },
          },
      ],
    });
    state = state
        .apply('player:unlocked', {
          'slotNumber': 1,
          'unlocked': ['Isha'],
        })
        .apply('player:unlocked', {
          'slotNumber': 5,
          'unlocked': ['Isha', 'Meera (Player 5)'],
        });

    await tester.pumpWidget(
      ProviderScope(
        child: MaterialApp(
          home: Scaffold(
            backgroundColor: Stage.background,
            body: AudienceBattle(state: state),
          ),
        ),
      ),
    );
    await tester.pump(const Duration(seconds: 1));

    expect(tester.takeException(), isNull); // no RenderFlex overflow
    expect(find.textContaining(_prompt200), findsNWidgets(5));
    expect(find.text(_reaction100), findsNWidgets(5));
    expect(find.text('(Player 5)'), findsOneWidget);
    expect(find.text('(Player 2)'), findsOneWidget);
    expect(find.text('Unlocked!'), findsNWidgets(2));
    expect(find.text('Disconnected'), findsOneWidget);
    expect(
      find.text(
        'Isha, Meera (Player 5) unlocked the treasure! '
        'The winner is still decided when the timer hits 00:00.',
      ),
      findsOneWidget,
    );
  });
}
