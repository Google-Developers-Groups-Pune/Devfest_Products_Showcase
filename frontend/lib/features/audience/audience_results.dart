import 'package:material_ui/material_ui.dart';

import '../../core/theme/score_colors.dart';
import '../../core/widgets/shape_marker.dart';
import 'audience_state.dart';
import 'audience_style.dart';

/// The finish on the big screen (FE-23). Every size is in stage pixels.
///
/// RESULT_PENDING: "Time's up!", then the provisional winner marked as
/// pending (D22). RESULTS: the winner, the tie-break line, every player
/// ranked (D47) and the story card. It stays until the Controller moves on:
/// nothing here advances on a timer.
class AudienceResults extends StatelessWidget {
  const AudienceResults({super.key, required this.state});
  final AudienceState state;

  @override
  Widget build(BuildContext context) {
    final result = state.result;
    final winner = result?['winner'];
    if (state.phase == 'RESULTS' && result != null) {
      return WinnerScreen(result: result, treasure: state.treasure);
    }
    if (winner is Map) return ProvisionalScreen(winner: Map<String, dynamic>.from(winner));
    return const TimeUpScreen();
  }
}

const _salmon = Color(0xFFF28B82);

// ---------------------------------------------------------------- time up

class TimeUpScreen extends StatelessWidget {
  const TimeUpScreen({super.key});

  @override
  Widget build(BuildContext context) => const Center(
    child: Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Text("Time's up!", style: TextStyle(fontSize: 220, fontWeight: FontWeight.w500, color: _salmon, height: 1.1)),
        SizedBox(height: 70),
        StageDots(),
        SizedBox(height: 40),
        Text('Calculating results…', style: TextStyle(fontSize: 56, color: Stage.muted)),
      ],
    ),
  );
}

/// Four Google dots that pulse in turn.
class StageDots extends StatefulWidget {
  const StageDots({super.key, this.size = 30});
  final double size;

  @override
  State<StageDots> createState() => _StageDotsState();
}

class _StageDotsState extends State<StageDots> with SingleTickerProviderStateMixin {
  late final _c = AnimationController(vsync: this, duration: const Duration(milliseconds: 1400))..repeat();

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AnimatedBuilder(
    animation: _c,
    builder: (_, _) => Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        for (var i = 0; i < 4; i++)
          Padding(
            padding: EdgeInsets.symmetric(horizontal: widget.size * 0.3),
            child: Transform.translate(
              offset: Offset(0, ((_c.value * 4).floor() % 4 == i) ? -widget.size * 0.4 : 0),
              child: Container(
                width: widget.size,
                height: widget.size,
                decoration: BoxDecoration(color: Stage.googleColors[i], shape: BoxShape.circle),
              ),
            ),
          ),
      ],
    ),
  );
}

// ---------------------------------------------------------------- provisional

/// Provisional winner, not yet confirmed by the booth (D22, designed by dev).
class ProvisionalScreen extends StatelessWidget {
  const ProvisionalScreen({super.key, required this.winner});
  final Map<String, dynamic> winner;

  @override
  Widget build(BuildContext context) {
    final shape = '${winner['shape'] ?? 'BLUE_CIRCLE'}';
    final color = (shapeInfo[shape] ?? shapeInfo['BLUE_CIRCLE']!).color;
    final score = (winner['bestScore'] as num?)?.toInt();
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Text("Time's up!", style: TextStyle(fontSize: 110, fontWeight: FontWeight.w500, color: _salmon)),
          const SizedBox(height: 50),
          Container(
            width: 1100,
            padding: const EdgeInsets.fromLTRB(60, 50, 60, 56),
            decoration: BoxDecoration(
              color: Stage.card,
              borderRadius: BorderRadius.circular(48),
              border: Border.all(color: Stage.yellow.withValues(alpha: 0.7), width: 3),
            ),
            child: Column(
              children: [
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 28, vertical: 10),
                  decoration: BoxDecoration(color: Stage.tint(Stage.yellow), borderRadius: BorderRadius.circular(40)),
                  child: const Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(Icons.hourglass_top_rounded, color: Stage.yellow, size: 34),
                      SizedBox(width: 12),
                      Flexible(
                        child: FittedBox(
                          fit: BoxFit.scaleDown,
                          child: Text('Provisional · waiting for the booth to confirm', style: TextStyle(fontSize: 32, color: Stage.yellow)),
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 44),
                Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    ShapeMarker(shape, size: 96),
                    const SizedBox(width: 40),
                    ConstrainedBox(
                      constraints: const BoxConstraints(maxWidth: 760),
                      child: FittedBox(
                        fit: BoxFit.scaleDown,
                        child: Text(
                          '${winner['label'] ?? ''}',
                          style: TextStyle(fontSize: 120, fontWeight: FontWeight.w500, color: Stage.light(color)),
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 20),
                if (score != null)
                  Text(
                    '$score points',
                    style: TextStyle(fontSize: 56, fontFamily: 'AppMono', color: scoreColor(score)),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------- winner

/// "Isha wins!", the tie-break line, every player ranked, and the story card.
class WinnerScreen extends StatelessWidget {
  const WinnerScreen({super.key, required this.result, this.treasure});
  final Map<String, dynamic> result;
  final AudienceTreasure? treasure;

  List<Map<String, dynamic>> get _ranking {
    final rows = [
      for (final r in (result['ranking'] as List?) ?? const [])
        if (r is Map) Map<String, dynamic>.from(r),
    ]..sort((a, b) => ((a['rank'] as num?) ?? 99).compareTo((b['rank'] as num?) ?? 99));
    return rows;
  }

  @override
  Widget build(BuildContext context) {
    final winner = result['winner'];
    final label = winner is Map ? '${winner['label']}' : '';
    final tie = result['tieBreakExplanation'];
    final ranking = _ranking;
    final podium = ranking.take(3).toList();
    final rest = ranking.skip(3).toList();
    return Padding(
      padding: const EdgeInsets.fromLTRB(80, 50, 80, 60),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Expanded(
            child: Column(
              children: [
                FittedBox(
                  fit: BoxFit.scaleDown,
                  child: Text('$label wins!', style: const TextStyle(fontSize: 130, fontWeight: FontWeight.w500, height: 1.1)),
                ),
                if (tie is String && tie.isNotEmpty) ...[
                  const SizedBox(height: 16),
                  Text(tie, textAlign: TextAlign.center, style: const TextStyle(fontSize: 36, color: Stage.muted)),
                ],
                const SizedBox(height: 24),
                Expanded(child: _Podium(rows: podium)),
                if (rest.isNotEmpty) ...[
                  const SizedBox(height: 24),
                  for (final r in rest) _RestRow(row: r),
                ],
              ],
            ),
          ),
          const SizedBox(width: 60),
          SizedBox(width: 680, child: _StoryCard(treasure: treasure)),
        ],
      ),
    );
  }
}

class _Podium extends StatelessWidget {
  const _Podium({required this.rows});
  final List<Map<String, dynamic>> rows;

  @override
  Widget build(BuildContext context) {
    Map<String, dynamic>? at(int rank) => rows.where((r) => r['rank'] == rank).firstOrNull;
    // Second, first, third, as on a real podium.
    final order = [(at(2), 2, 0.48), (at(1), 1, 0.66), (at(3), 3, 0.33)];
    return LayoutBuilder(
      builder: (context, box) => Row(
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          for (final (row, rank, frac) in order)
            Expanded(
              child: row == null
                  ? const SizedBox()
                  : Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 8),
                      // Room above each block for the trophy, marker, label and score.
                      child: _Step(row: row, rank: rank, blockHeight: (box.maxHeight - 250).clamp(60, 1000) * frac / 0.66),
                    ),
            ),
        ],
      ),
    );
  }
}

class _Step extends StatelessWidget {
  const _Step({required this.row, required this.rank, required this.blockHeight});
  final Map<String, dynamic> row;
  final int rank;
  final double blockHeight;

  @override
  Widget build(BuildContext context) {
    final shape = '${row['shape'] ?? 'BLUE_CIRCLE'}';
    final color = (shapeInfo[shape] ?? shapeInfo['BLUE_CIRCLE']!).color;
    final score = (row['bestScore'] as num?)?.toInt();
    final onColor = color == Stage.yellow ? const Color(0xFF202124) : Colors.white;
    return Column(
      mainAxisAlignment: MainAxisAlignment.end,
      children: [
        if (rank == 1) const Icon(Icons.emoji_events, size: 64, color: Stage.yellow),
        const SizedBox(height: 8),
        ShapeMarker(shape, size: 52),
        const SizedBox(height: 10),
        // Labels are never cut off: "Meera (Player 5)" must stay whole.
        FittedBox(
          fit: BoxFit.scaleDown,
          child: Text('${row['label'] ?? ''}', style: const TextStyle(fontSize: 38)),
        ),
        Text(score?.toString() ?? '–', style: const TextStyle(fontSize: 34, fontFamily: 'AppMono', color: Stage.muted)),
        const SizedBox(height: 12),
        Container(
          height: blockHeight,
          alignment: Alignment.topCenter,
          padding: const EdgeInsets.only(top: 16),
          decoration: BoxDecoration(
            color: color,
            borderRadius: const BorderRadius.vertical(top: Radius.circular(28)),
          ),
          child: Text('$rank', style: TextStyle(fontSize: 64, color: onColor)),
        ),
      ],
    );
  }
}

/// Places 4 and 5, under the podium (D47: every player is ranked).
class _RestRow extends StatelessWidget {
  const _RestRow({required this.row});
  final Map<String, dynamic> row;

  @override
  Widget build(BuildContext context) {
    final shape = '${row['shape'] ?? 'BLUE_CIRCLE'}';
    final score = (row['bestScore'] as num?)?.toInt();
    return Container(
      margin: const EdgeInsets.only(top: 12),
      padding: const EdgeInsets.symmetric(horizontal: 32, vertical: 14),
      decoration: BoxDecoration(color: Stage.card, borderRadius: BorderRadius.circular(24)),
      child: Row(
        children: [
          SizedBox(
            width: 70,
            child: Text('${row['rank']}', style: const TextStyle(fontSize: 36, fontFamily: 'AppMono', color: Stage.muted)),
          ),
          ShapeMarker(shape, size: 34),
          const SizedBox(width: 20),
          Expanded(
            child: FittedBox(
              fit: BoxFit.scaleDown,
              alignment: Alignment.centerLeft,
              child: Text('${row['label'] ?? ''}', style: const TextStyle(fontSize: 34)),
            ),
          ),
          Text(
            score?.toString() ?? '–',
            style: TextStyle(fontSize: 36, fontFamily: 'AppMono', color: score == null ? Stage.muted : scoreColor(score)),
          ),
        ],
      ),
    );
  }
}

/// The treasure's story with its image and the agents behind the game.
class _StoryCard extends StatelessWidget {
  const _StoryCard({required this.treasure});
  final AudienceTreasure? treasure;

  static const agents = [
    'Treasure Generator agent',
    'Filter agent',
    'Guard agent',
    'Prompt and Emoji agent',
    'Result Evaluation agent',
  ];

  @override
  Widget build(BuildContext context) {
    final t = treasure;
    final image = t?.imageUrl ?? '';
    return Container(
      padding: const EdgeInsets.all(40),
      decoration: BoxDecoration(color: Stage.tint(Stage.yellow), borderRadius: BorderRadius.circular(36)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (image.isNotEmpty) ...[
            ClipRRect(
              borderRadius: BorderRadius.circular(24),
              child: AspectRatio(
                aspectRatio: 2.2,
                child: Image.network(
                  image,
                  fit: BoxFit.cover,
                  errorBuilder: (_, _, _) => const ColoredBox(
                    color: Stage.card,
                    child: Center(child: Icon(Icons.image_not_supported_outlined, size: 64, color: Stage.muted)),
                  ),
                ),
              ),
            ),
            const SizedBox(height: 28),
          ] else ...[
            const Icon(Icons.auto_stories_outlined, size: 60, color: Stage.yellow),
            const SizedBox(height: 24),
          ],
          Text(
            t == null ? 'The story' : 'The story of ${t.title}',
            style: const TextStyle(fontSize: 44, height: 1.2),
          ),
          const SizedBox(height: 20),
          Expanded(
            child: Text(
              t?.backstory ?? '',
              maxLines: 6,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(fontSize: 30, height: 1.45),
            ),
          ),
          const SizedBox(height: 20),
          const Text('How it works', style: TextStyle(fontSize: 30, color: Stage.yellow)),
          const SizedBox(height: 18),
          Wrap(
            spacing: 14,
            runSpacing: 14,
            children: [
              for (final a in agents)
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 22, vertical: 12),
                  decoration: BoxDecoration(color: Stage.background, borderRadius: BorderRadius.circular(30)),
                  child: Text(a, style: const TextStyle(fontSize: 26)),
                ),
            ],
          ),
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------- discarded

/// The round was discarded (designed by dev). Never shows the reason.
class DiscardedScreen extends StatelessWidget {
  const DiscardedScreen({super.key});

  @override
  Widget build(BuildContext context) => const Center(
    child: Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        StageDots(size: 36),
        SizedBox(height: 60),
        Text('This round was cancelled', style: TextStyle(fontSize: 120, fontWeight: FontWeight.w500)),
        SizedBox(height: 30),
        Text('No winner this time. The next group starts soon.', style: TextStyle(fontSize: 52, color: Stage.muted)),
      ],
    ),
  );
}
