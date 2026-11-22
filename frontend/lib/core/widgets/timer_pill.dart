import 'package:material_ui/material_ui.dart';

import '../theme/heist_theme.dart';

/// Formats a remaining time as mm:ss, rounding partial seconds up so the
/// clock reads 00:01 until the very end.
String formatClock(Duration remaining) {
  final s = remaining.isNegative ? 0 : (remaining.inMilliseconds / 1000).ceil();
  return '${(s ~/ 60).toString().padLeft(2, '0')}:${(s % 60).toString().padLeft(2, '0')}';
}

/// Countdown pill. Blue normally, yellow in the last 30 seconds, red in the last 10.
///
/// It only displays a value. The server-synced countdown itself is FE-03.
class TimerPill extends StatelessWidget {
  const TimerPill({super.key, required this.remaining, this.size = TimerPillSize.medium});

  final Duration remaining;
  final TimerPillSize size;

  static Tone toneFor(Duration remaining) {
    final secs = (remaining.inMilliseconds / 1000).ceil();
    if (secs <= 10) return Tone.danger;
    if (secs <= 30) return Tone.warning;
    return Tone.accent;
  }

  @override
  Widget build(BuildContext context) {
    final (bg, fg) = toneFor(remaining).colors(context.hc);
    final (fontSize, iconSize, padding) = switch (size) {
      TimerPillSize.small => (18.0, 18.0, const EdgeInsets.fromLTRB(10, 4, 14, 4)),
      TimerPillSize.medium => (30.0, 24.0, const EdgeInsets.fromLTRB(14, 8, 18, 8)),
      TimerPillSize.large => (64.0, 48.0, const EdgeInsets.fromLTRB(24, 10, 32, 10)),
    };
    return Container(
      padding: padding,
      decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(999)),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        spacing: fontSize * 0.25,
        children: [
          Icon(Icons.timer_outlined, color: fg, size: iconSize),
          Text(
            formatClock(remaining),
            style: context.mono(TextStyle(fontSize: fontSize, fontWeight: FontWeight.w500, color: fg)),
          ),
        ],
      ),
    );
  }
}

enum TimerPillSize { small, medium, large }
