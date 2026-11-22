import 'package:material_ui/material_ui.dart';

import '../../core/widgets/widgets.dart';

/// Widget gallery for design review (FE-26). Open `/gallery` and compare
/// against the mockups in `docs/`.
class GalleryPage extends StatelessWidget {
  const GalleryPage({super.key});

  @override
  Widget build(BuildContext context) {
    final c = context.hc;
    return Scaffold(
      body: Column(
        children: [
          const TopStripe(),
          Expanded(
            child: ListView(
              padding: const EdgeInsets.all(24),
              children: [
                Row(
                  spacing: 12,
                  children: [
                    const StripeDots(),
                    const Text('Prompt Heist', style: TextStyle(fontSize: 22, fontWeight: FontWeight.w500)),
                    Text('Widget gallery', style: TextStyle(color: c.textSecondary)),
                  ],
                ),
                const SizedBox(height: 24),
                Wrap(
                  spacing: 24,
                  runSpacing: 24,
                  children: [
                    _section('Palette', const _PaletteDemo()),
                    _section('ShapeAvatar', const _ShapeDemo()),
                    _section('PlayerPill', const _PillDemo()),
                    _section('ScoreChip (0–39 red, 40–79 yellow, 80–99 blue, 100 green)', const _ScoreDemo()),
                    _section('StatusChip', const _StatusDemo()),
                    _section('TimerPill', const _TimerDemo()),
                    _section('Card', const _CardDemo()),
                    _section('Podium', const SizedBox(width: 640, child: _PodiumDemo())),
                    _section('MessageScreen', const _MessageDemo()),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  static Widget _section(String title, Widget child) => ConstrainedBox(
        constraints: const BoxConstraints(minWidth: 320, maxWidth: 680),
        child: HeistCard(title: title, child: child),
      );
}

class _PaletteDemo extends StatelessWidget {
  const _PaletteDemo();

  @override
  Widget build(BuildContext context) {
    const swatches = {
      'Blue #4285F4': HeistColors.blue,
      'Red #EA4335': HeistColors.red,
      'Yellow #FBBC05': HeistColors.yellow,
      'Green #34A853': HeistColors.green,
    };
    return Wrap(
      spacing: 12,
      runSpacing: 12,
      children: [
        for (final e in swatches.entries)
          Column(
            spacing: 6,
            children: [
              Container(
                width: 64,
                height: 64,
                decoration: BoxDecoration(color: e.value, borderRadius: BorderRadius.circular(16)),
              ),
              Text(e.key, style: context.mono(const TextStyle(fontSize: 11))),
            ],
          ),
      ],
    );
  }
}

class _ShapeDemo extends StatelessWidget {
  const _ShapeDemo();

  @override
  Widget build(BuildContext context) => Wrap(
        spacing: 20,
        runSpacing: 12,
        children: [
          for (final s in SlotShape.values)
            Column(
              spacing: 6,
              children: [
                ShapeAvatar(s, size: 40),
                Text('Slot ${s.index + 1}', style: TextStyle(fontSize: 12, color: context.hc.textSecondary)),
              ],
            ),
        ],
      );
}

class _PillDemo extends StatelessWidget {
  const _PillDemo();

  @override
  Widget build(BuildContext context) => const Wrap(
        spacing: 8,
        runSpacing: 8,
        children: [
          PlayerPill(shape: SlotShape.blueCircle, label: 'aman', isMe: true),
          PlayerPill(shape: SlotShape.redSquare, label: 'Priya'),
          PlayerPill(shape: SlotShape.yellowDiamond, label: 'Rohan'),
          PlayerPill(shape: SlotShape.greenPill, label: 'Sneha'),
          PlayerPill(shape: SlotShape.greenCircle, label: 'Meera (Player 5)'),
          PlayerPill(shape: SlotShape.greenCircle, label: 'Disconnected', dimmed: true),
        ],
      );
}

class _ScoreDemo extends StatelessWidget {
  const _ScoreDemo();

  @override
  Widget build(BuildContext context) => const Wrap(
        spacing: 10,
        runSpacing: 10,
        children: [
          ScoreChip(null),
          ScoreChip(0),
          ScoreChip(39),
          ScoreChip(40),
          ScoreChip(79),
          ScoreChip(80),
          ScoreChip(99),
          ScoreChip(100),
          ScoreChip(100, size: 56),
        ],
      );
}

class _StatusDemo extends StatelessWidget {
  const _StatusDemo();

  @override
  Widget build(BuildContext context) => const Wrap(
        spacing: 8,
        runSpacing: 8,
        children: [
          StatusChip('Unjoined', tone: Tone.neutral),
          StatusChip('Lobby'),
          StatusChip('Playing'),
          StatusChip('Locked 100', tone: Tone.success),
          StatusChip('Disconnected', tone: Tone.warning),
          StatusChip('Result pending', tone: Tone.warning),
          StatusChip('Complete', tone: Tone.neutral),
          StatusChip('Passed content filter', tone: Tone.success, icon: Icons.check),
          StatusChip('Agent down', tone: Tone.danger, icon: Icons.error_outline),
        ],
      );
}

class _TimerDemo extends StatelessWidget {
  const _TimerDemo();

  @override
  Widget build(BuildContext context) => const Wrap(
        spacing: 12,
        runSpacing: 12,
        crossAxisAlignment: WrapCrossAlignment.center,
        children: [
          TimerPill(remaining: Duration(seconds: 61), size: TimerPillSize.large),
          TimerPill(remaining: Duration(seconds: 25)),
          TimerPill(remaining: Duration(seconds: 7)),
          TimerPill(remaining: Duration(milliseconds: 300), size: TimerPillSize.small),
        ],
      );
}

class _CardDemo extends StatelessWidget {
  const _CardDemo();

  @override
  Widget build(BuildContext context) => const Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        spacing: 12,
        children: [
          HeistCard(
            title: 'Hand out booth codes',
            subtitle: '3 of 5 players joined',
            trailing: StatusChip('Joining'),
            child: Text('Neutral panel, used for every Controller section.'),
          ),
          HeistCard(
            tone: Tone.warning,
            title: 'The challenge',
            child: Text('Ask for a polite, 3-line monsoon poem about Pune that ends with a question.'),
          ),
          HeistCard(
            tone: Tone.accent,
            padding: EdgeInsets.all(12),
            child: IconLine(Icons.balance, 'Tie on 100. Dev reached it first (submission #19 before #32).'),
          ),
        ],
      );
}

class _PodiumDemo extends StatelessWidget {
  const _PodiumDemo();

  @override
  Widget build(BuildContext context) => const Podium(
        height: 360,
        entries: [
          PodiumEntry(rank: 1, shape: SlotShape.blueCircle, label: 'Isha', score: 100),
          PodiumEntry(rank: 2, shape: SlotShape.greenCircle, label: 'Meera (Player 5)', score: 100),
          PodiumEntry(rank: 3, shape: SlotShape.yellowDiamond, label: 'Kabir', score: 100),
        ],
      );
}

class _MessageDemo extends StatelessWidget {
  const _MessageDemo();

  @override
  Widget build(BuildContext context) {
    final examples = <String, MessageScreen>{
      'Kicked': const MessageScreen(
        icon: Icons.phonelink_erase,
        tone: Tone.warning,
        title: 'You joined on another device',
        message: 'This phone has been signed out of the game.',
      ),
      'Closed': const MessageScreen(
        icon: Icons.check_circle_outline,
        tone: Tone.success,
        title: 'Thanks for playing!',
        message: 'This game has finished.',
      ),
      'Idle (big screen)': const MessageScreen(
        icon: Icons.diamond_outlined,
        tone: Tone.warning,
        title: 'Prompt Heist',
        message: 'The next game starts soon.',
        large: true,
      ),
      'Round cancelled': const MessageScreen(
        icon: Icons.block,
        tone: Tone.danger,
        title: 'Round cancelled',
        message: 'No winner this time. Ask the booth host about playing again.',
      ),
    };
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: [
        for (final e in examples.entries)
          OutlinedButton(
            onPressed: () => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => _Dismissable(e.value))),
            child: Text(e.key),
          ),
      ],
    );
  }
}

/// Wraps a full-screen example so a click anywhere goes back to the gallery.
class _Dismissable extends StatelessWidget {
  const _Dismissable(this.child);

  final Widget child;

  @override
  Widget build(BuildContext context) => GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: () => Navigator.of(context).pop(),
        child: child,
      );
}
