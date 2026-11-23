import 'package:material_ui/material_ui.dart';

import '../theme/heist_theme.dart';
import '../timer/countdown_math.dart';

/// Countdown pill. Blue normally, yellow in the last 30 seconds, red in the last 10.
///
/// It only displays a value. The server-synced countdown itself is FE-03.
/// A null [remaining] shows `--:--`; [tone] overrides the colour.
class TimerPill extends StatelessWidget {
  const TimerPill({super.key, required this.remaining, this.size = TimerPillSize.medium, this.tone});

  final Duration? remaining;
  final TimerPillSize size;
  final Tone? tone;

  static Tone toneFor(Duration remaining) {
    final secs = (remaining.inMilliseconds / 1000).ceil();
    if (secs <= 10) return Tone.danger;
    if (secs <= 30) return Tone.warning;
    return Tone.accent;
  }

  @override
  Widget build(BuildContext context) {
    final left = remaining;
    final (bg, fg) = (tone ?? (left == null ? Tone.neutral : toneFor(left))).colors(context.hc);
    final (fontSize, iconSize, padding) = switch (size) {
      TimerPillSize.small => (22.0, 20.0, const EdgeInsets.fromLTRB(12, 6, 16, 6)),
      TimerPillSize.medium => (30.0, 24.0, const EdgeInsets.fromLTRB(14, 8, 18, 8)),
      TimerPillSize.large => (64.0, 48.0, const EdgeInsets.fromLTRB(24, 10, 32, 10)),
    };
    return AnimatedContainer(
      duration: const Duration(milliseconds: 300),
      padding: padding,
      decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(999)),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        spacing: fontSize * 0.25,
        children: [
          Icon(Icons.timer_outlined, color: fg, size: iconSize),
          Text(
            left == null ? '--:--' : formatCountdown(left),
            style: context.mono(TextStyle(fontSize: fontSize, fontWeight: FontWeight.w500, color: fg)),
          ),
        ],
      ),
    );
  }
}

enum TimerPillSize { small, medium, large }
