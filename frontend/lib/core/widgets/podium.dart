import 'package:material_ui/material_ui.dart';

import '../theme/heist_theme.dart';
import 'shape_avatar.dart';

class PodiumEntry {
  const PodiumEntry({required this.rank, required this.shape, required this.label, required this.score});

  final int rank;
  final SlotShape shape;
  final String label;

  /// Null when the player has no score.
  final int? score;
}

/// Top three on blocks in their slot colours, ordered 2 – 1 – 3, with a
/// trophy over first place. Ranks 4 and 5 are shown by the caller (D47).
class Podium extends StatelessWidget {
  const Podium({super.key, required this.entries, this.height = 420});

  /// Any order; only ranks 1 to 3 are drawn.
  final List<PodiumEntry> entries;
  final double height;

  @override
  Widget build(BuildContext context) {
    PodiumEntry? at(int rank) => entries.where((e) => e.rank == rank).firstOrNull;
    final order = [at(2), at(1), at(3)];
    return SizedBox(
      height: height,
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.end,
        spacing: 16,
        children: [
          for (final e in order)
            Expanded(child: e == null ? const SizedBox.shrink() : _Step(entry: e, maxHeight: height)),
        ],
      ),
    );
  }
}

class _Step extends StatelessWidget {
  const _Step({required this.entry, required this.maxHeight});

  final PodiumEntry entry;
  final double maxHeight;

  @override
  Widget build(BuildContext context) {
    final c = context.hc;
    final blockFraction = switch (entry.rank) { 1 => 0.66, 2 => 0.48, _ => 0.33 };
    final unit = maxHeight / 420;
    return Column(
      mainAxisAlignment: MainAxisAlignment.end,
      spacing: 6 * unit,
      children: [
        if (entry.rank == 1) Icon(Icons.emoji_events, color: HeistColors.yellow, size: 44 * unit),
        ShapeAvatar(entry.shape, size: 38 * unit),
        Text(
          entry.label,
          textAlign: TextAlign.center,
          style: TextStyle(fontSize: 24 * unit, color: c.text),
        ),
        Text(
          entry.score?.toString() ?? '–',
          style: context.mono(TextStyle(fontSize: 22 * unit, color: c.textSecondary)),
        ),
        Container(
          height: maxHeight * blockFraction * 0.62,
          width: double.infinity,
          alignment: Alignment.topCenter,
          padding: EdgeInsets.only(top: 12 * unit),
          decoration: BoxDecoration(
            color: entry.shape.color,
            borderRadius: BorderRadius.vertical(top: Radius.circular(24 * unit)),
          ),
          child: Text(
            '${entry.rank}',
            style: TextStyle(fontSize: 44 * unit, color: entry.shape.onColor),
          ),
        ),
      ],
    );
  }
}
