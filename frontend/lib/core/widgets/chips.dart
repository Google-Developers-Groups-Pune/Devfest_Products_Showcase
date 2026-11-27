import 'package:material_ui/material_ui.dart';

import '../theme/heist_theme.dart';
import 'shape_avatar.dart';

/// Small rounded status label, coloured by meaning.
class StatusChip extends StatelessWidget {
  const StatusChip(this.text, {super.key, this.tone = Tone.accent, this.icon});

  final String text;
  final Tone tone;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    final (bg, fg) = tone.colors(context.hc);
    return Container(
      padding: EdgeInsets.fromLTRB(icon == null ? 10 : 8, 4, 10, 4),
      decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(999)),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        spacing: 4,
        children: [
          if (icon != null) Icon(icon, size: 14, color: fg),
          Text(text, style: TextStyle(color: fg, fontSize: 12, fontWeight: FontWeight.w500)),
        ],
      ),
    );
  }
}

/// Round score badge in the score colour. Shows a dash when there is no score.
class ScoreChip extends StatelessWidget {
  const ScoreChip(this.score, {super.key, this.size = 40});

  final int? score;
  final double size;

  @override
  Widget build(BuildContext context) {
    final (bg, fg) = scoreTone(score).colors(context.hc);
    return Container(
      width: size,
      height: size,
      alignment: Alignment.center,
      decoration: BoxDecoration(color: bg, shape: BoxShape.circle),
      child: Text(
        score?.toString() ?? '–',
        semanticsLabel: score == null ? 'No score' : 'Score $score',
        style: context.mono(TextStyle(fontSize: size * 0.36, fontWeight: FontWeight.w500, color: fg)),
      ),
    );
  }
}

/// A rounded pill with the player's shape and label.
///
/// The label is never cut off: "Meera (Player 5)" must stay distinguishable
/// from another Meera (PRD 5.1), so long labels wrap instead.
class PlayerPill extends StatelessWidget {
  const PlayerPill({super.key, required this.shape, required this.label, this.isMe = false, this.dimmed = false});

  final SlotShape shape;
  final String label;
  final bool isMe;

  /// For a slot whose player is disconnected.
  final bool dimmed;

  @override
  Widget build(BuildContext context) {
    final (bg, fg) = shape.tone.colors(context.hc);
    return Opacity(
      opacity: dimmed ? 0.5 : 1,
      child: Container(
        padding: const EdgeInsets.fromLTRB(6, 6, 14, 6),
        decoration: BoxDecoration(
          color: bg,
          borderRadius: BorderRadius.circular(999),
          border: isMe ? Border.all(color: shape.color, width: 2) : null,
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          spacing: 8,
          children: [
            ShapeAvatar(shape, size: 22),
            Flexible(
              child: Text(
                isMe ? '$label (you)' : label,
                style: TextStyle(color: fg, fontWeight: FontWeight.w500),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
