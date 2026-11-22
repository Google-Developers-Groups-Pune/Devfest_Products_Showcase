import 'package:flutter_test/flutter_test.dart';
import 'package:material_ui/material_ui.dart';

import 'package:prompt_heist/core/widgets/widgets.dart';
import 'package:prompt_heist/features/gallery/gallery_page.dart';

Widget _wrap(Widget child) => MaterialApp(theme: buildHeistTheme(), home: Scaffold(body: Center(child: child)));

void main() {
  testWidgets('PlayerPill marks the current player and never truncates the label', (tester) async {
    await tester.pumpWidget(_wrap(const SizedBox(
      width: 140,
      child: PlayerPill(shape: SlotShape.greenCircle, label: 'Meera (Player 5)', isMe: true),
    )));
    final text = tester.widget<Text>(find.text('Meera (Player 5) (you)'));
    expect(text.overflow, isNot(TextOverflow.ellipsis));
    expect(text.maxLines, isNull);
  });

  testWidgets('ScoreChip shows a dash with no score', (tester) async {
    await tester.pumpWidget(_wrap(const Row(children: [ScoreChip(null), ScoreChip(73)])));
    expect(find.text('–'), findsOneWidget);
    expect(find.text('73'), findsOneWidget);
  });

  testWidgets('Podium draws ranks 2, 1, 3 from left to right and ignores rank 4', (tester) async {
    tester.view.physicalSize = const Size(1400, 900);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(_wrap(const SizedBox(
      width: 900,
      child: Podium(entries: [
        PodiumEntry(rank: 3, shape: SlotShape.yellowDiamond, label: 'Kabir', score: 90),
        PodiumEntry(rank: 1, shape: SlotShape.blueCircle, label: 'Isha', score: 100),
        PodiumEntry(rank: 4, shape: SlotShape.greenPill, label: 'Zoya', score: 20),
        PodiumEntry(rank: 2, shape: SlotShape.redSquare, label: 'Dev', score: 100),
      ]),
    )));
    final x = {for (final n in ['Dev', 'Isha', 'Kabir']) n: tester.getCenter(find.text(n)).dx};
    expect(x['Dev']! < x['Isha']!, isTrue);
    expect(x['Isha']! < x['Kabir']!, isTrue);
    expect(find.text('Zoya'), findsNothing);
    expect(find.byIcon(Icons.emoji_events), findsOneWidget);
  });

  testWidgets('MessageScreen shows title, message, action and footer', (tester) async {
    var tapped = false;
    await tester.pumpWidget(MaterialApp(
      theme: buildHeistTheme(),
      home: MessageScreen(
        icon: Icons.block,
        title: 'Round cancelled',
        message: 'No winner this time.',
        actionLabel: 'OK',
        onAction: () => tapped = true,
        footer: 'Keep this page open.',
      ),
    ));
    expect(find.byType(TopStripe), findsOneWidget);
    expect(find.text('Round cancelled'), findsOneWidget);
    expect(find.text('No winner this time.'), findsOneWidget);
    expect(find.text('Keep this page open.'), findsOneWidget);
    await tester.tap(find.text('OK'));
    expect(tapped, isTrue);
  });

  testWidgets('gallery renders every widget without layout errors', (tester) async {
    tester.view.physicalSize = const Size(1600, 4000);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(MaterialApp(theme: buildHeistTheme(), home: const GalleryPage()));
    await tester.pumpAndSettle();
    for (final t in [ShapeAvatar, PlayerPill, ScoreChip, StatusChip, TimerPill, HeistCard, Podium]) {
      expect(find.byType(t), findsWidgets, reason: '$t');
    }
    expect(tester.takeException(), isNull);
  });
}
