import 'dart:async';

import 'package:material_ui/material_ui.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/widgets/widgets.dart';
import '../battle/game_state.dart';
import '../widgets/player_ui.dart';
import 'result_page.dart';

class TimeUpPage extends ConsumerStatefulWidget {
  const TimeUpPage({super.key});

  @override
  ConsumerState<TimeUpPage> createState() => _TimeUpPageState();
}

class _TimeUpPageState extends ConsumerState<TimeUpPage> {
  Timer? _poll;

  @override
  void initState() {
    super.initState();
    // If result:confirmed is missed, ask the server every 3 seconds.
    _poll = Timer.periodic(const Duration(seconds: 3), (_) {
      if (mounted) ref.invalidate(resultProvider);
    });
  }

  @override
  void dispose() {
    _poll?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    ref.listen(resultProvider, (prev, next) {
      final d = next.value;
      if (d != null && d.confirmed) context.go('/player/result');
    });

    final c = context.hc;
    final game = ref.watch(gameProvider);
    final best = game.bestScore;
    final scored = game.prompts
        .where((p) => p.stage == PromptStage.scored)
        .length;
    final (bg, fg) = Tone.danger.colors(c);

    return PlayerPage(
      top: Row(
        children: [
          Container(
            padding: const EdgeInsets.fromLTRB(12, 6, 16, 6),
            decoration: BoxDecoration(
              color: bg,
              borderRadius: BorderRadius.circular(999),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              spacing: 6,
              children: [
                Icon(Icons.timer_off_outlined, size: 20, color: fg),
                Text(
                  '00:00',
                  style: context.mono(
                    TextStyle(
                      fontSize: 22,
                      fontWeight: FontWeight.w500,
                      color: fg,
                    ),
                  ),
                ),
              ],
            ),
          ),
          const Spacer(),
          StatusChip(
            best == null ? 'No score yet' : 'Best $best',
            tone: scoreTone(best),
          ),
        ],
      ),
      content: [
        const SizedBox(height: 36),
        const Center(
          child: SizedBox.square(
            dimension: 36,
            child: CircularProgressIndicator(strokeWidth: 3),
          ),
        ),
        const Center(child: StripeDots(size: 10)),
        Text(
          "Time's up!",
          textAlign: TextAlign.center,
          style: TextStyle(
            fontSize: 28,
            fontWeight: FontWeight.w500,
            color: c.text,
          ),
        ),
        Text(
          'Calculating results…',
          textAlign: TextAlign.center,
          style: TextStyle(color: c.textSecondary),
        ),
        const SizedBox(height: 8),
        Row(
          spacing: 12,
          children: [
            Expanded(
              child: _Stat(
                'Your best score',
                best?.toString() ?? '0',
                scoreTone(best ?? 0),
              ),
            ),
            Expanded(
              child: _Stat('Prompts scored', '$scored', Tone.neutral),
            ),
          ],
        ),
        const InfoCard(
          tone: Tone.accent,
          child: IconLine(
            Icons.emoji_events_outlined,
            'The highest best score wins. If two players tie, the player '
            'who reached that score first wins.',
          ),
        ),
      ],
    );
  }
}

class _Stat extends StatelessWidget {
  const _Stat(this.label, this.value, this.tone);
  final String label;
  final String value;
  final Tone tone;

  @override
  Widget build(BuildContext context) {
    final c = context.hc;
    return InfoCard(
      tone: tone,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        spacing: 2,
        children: [
          Text(label, style: TextStyle(fontSize: 12, color: c.textSecondary)),
          Text(
            value,
            style: context.mono(
              TextStyle(
                fontSize: 24,
                fontWeight: FontWeight.w500,
                color: c.text,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
