import 'package:material_ui/material_ui.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/api/player_api.dart';
import '../../../core/api/token_store.dart';
import '../../../core/widgets/widgets.dart';
import '../battle/game_state.dart';
import '../widgets/player_ui.dart';

/// GET /api/player/result. PENDING until the Controller confirms.
final resultProvider = FutureProvider.autoDispose<Json>((ref) {
  ref.watch(tokenProvider);
  return ref.watch(playerApiProvider).result();
});

String ordinal(int n) {
  final m100 = n % 100;
  if (m100 >= 11 && m100 <= 13) return '${n}th';
  return switch (n % 10) {
    1 => '${n}st',
    2 => '${n}nd',
    3 => '${n}rd',
    _ => '${n}th',
  };
}

class ResultPage extends ConsumerStatefulWidget {
  const ResultPage({super.key});

  @override
  ConsumerState<ResultPage> createState() => _ResultPageState();
}

class _ResultPageState extends ConsumerState<ResultPage> {
  bool _left = false;

  @override
  void initState() {
    super.initState();
    // Not confirmed yet: back to the time up screen. Done from a listener,
    // after the frame, never from build.
    ref.listenManual(resultProvider, (_, next) {
      final d = next.value;
      if (d == null || d['status'] == 'CONFIRMED' || _left) return;
      _left = true;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) context.go('/player/timeup');
      });
    }, fireImmediately: true);
  }

  @override
  Widget build(BuildContext context) {
    final res = ref.watch(resultProvider);
    final mySlot = ref.watch(gameProvider.select((g) => g.mySlot));
    return res.when(
      loading: () => const PlayerLoading(),
      error: (e, _) => PlayerLoading(
        message: 'Cannot load the result.',
        onRetry: () => ref.invalidate(resultProvider),
      ),
      data: (d) {
        // Not confirmed yet: the listener in initState goes back to time up.
        if (d['status'] != 'CONFIRMED') return const PlayerLoading();
        return _ResultView(d, mySlot: mySlot);
      },
    );
  }
}

class _ResultView extends StatelessWidget {
  const _ResultView(this.d, {required this.mySlot});
  final Json d;
  final int? mySlot;

  @override
  Widget build(BuildContext context) {
    final c = context.hc;
    final ranking = [
      for (final r in (d['ranking'] as List))
        Map<String, dynamic>.from(r as Map),
    ];
    final myRank = (d['myRank'] as num?)?.toInt();
    final mine = ranking.where((r) => r['rank'] == myRank).toList();
    final myBest = mine.isEmpty
        ? null
        : (mine.first['bestScore'] as num?)?.toInt();
    final tie = d['tieBreakExplanation'] as String?;
    final story = d['story'] is Map
        ? Map<String, dynamic>.from(d['story'] as Map)
        : null;

    final String headline;
    final String sub;
    final Tone tone;
    final IconData icon;
    if (myBest == null) {
      // No score at all: shown as zero.
      headline = 'Your score is zero';
      sub = myRank == null
          ? 'Better luck next time'
          : 'You came ${ordinal(myRank)}';
      tone = Tone.danger;
      icon = Icons.sentiment_neutral_rounded;
    } else if (myRank == 1) {
      headline = 'You won!';
      sub = 'Best score: $myBest';
      tone = Tone.success;
      icon = Icons.emoji_events_rounded;
    } else {
      headline = myRank == null
          ? 'Final result'
          : 'You came ${ordinal(myRank)}';
      sub = 'Best score: $myBest';
      tone = Tone.accent;
      icon = Icons.flag_rounded;
    }
    final (iconBg, iconFg) = tone.colors(c);

    String label(Map<String, dynamic> r) =>
        r['slotNumber'] == mySlot ? '${r['label']} (you)' : '${r['label']}';

    final top = ranking.where((r) => ((r['rank'] as num?) ?? 99) <= 3);
    final rest = ranking.skip(3).toList();

    return PlayerPage(
      content: [
        const SizedBox(height: 4),
        Center(
          child: Container(
            width: 72,
            height: 72,
            decoration: BoxDecoration(color: iconBg, shape: BoxShape.circle),
            child: Icon(icon, size: 36, color: iconFg),
          ),
        ),
        Column(
          spacing: 4,
          children: [
            Text(
              'Results confirmed',
              style: TextStyle(fontSize: 12, color: c.textSecondary),
            ),
            Text(
              headline,
              textAlign: TextAlign.center,
              style: TextStyle(
                fontSize: 28,
                fontWeight: FontWeight.w500,
                color: c.text,
              ),
            ),
            Text(sub, style: TextStyle(color: c.textSecondary, fontSize: 15)),
          ],
        ),
        if (top.isNotEmpty)
          Podium(
            height: 260,
            entries: [
              for (final r in top)
                PodiumEntry(
                  rank: (r['rank'] as num).toInt(),
                  shape: slotShapeOf('${r['shape']}'),
                  label: label(r),
                  score: (r['bestScore'] as num?)?.toInt() ?? 0,
                ),
            ],
          ),
        if (rest.isNotEmpty)
          InfoCard(
            child: Column(
              spacing: 10,
              children: [
                for (final r in rest)
                  _RankRow(r, label: label(r), isMe: r['slotNumber'] == mySlot),
              ],
            ),
          ),
        if (tie != null && tie.isNotEmpty)
          InfoCard(
            tone: Tone.warning,
            child: IconLine(Icons.balance_outlined, tie),
          ),
        if (story != null) _StoryCard(story),
      ],
      bottom: [
        Text(
          'The MC will tell the story behind the vault.',
          textAlign: TextAlign.center,
          style: TextStyle(fontSize: 12, color: c.textMuted),
        ),
      ],
    );
  }
}

class _RankRow extends StatelessWidget {
  const _RankRow(this.r, {required this.label, required this.isMe});
  final Map<String, dynamic> r;
  final String label;
  final bool isMe;

  @override
  Widget build(BuildContext context) {
    final c = context.hc;
    final score = (r['bestScore'] as num?)?.toInt();
    final (_, scoreFg) = scoreTone(score ?? 0).colors(c);
    return Row(
      spacing: 10,
      children: [
        SizedBox(
          width: 20,
          child: Text(
            '${r['rank']}',
            style: context.mono(TextStyle(color: c.textMuted)),
          ),
        ),
        ShapeAvatar(slotShapeOf('${r['shape']}'), size: 20),
        Expanded(
          child: Text(
            label,
            style: TextStyle(
              color: c.text,
              fontWeight: isMe ? FontWeight.w500 : FontWeight.w400,
            ),
          ),
        ),
        Text(
          '${score ?? 0}',
          style: context.mono(
            TextStyle(color: scoreFg, fontWeight: FontWeight.w500),
          ),
        ),
      ],
    );
  }
}

class _StoryCard extends StatelessWidget {
  const _StoryCard(this.story);
  final Map<String, dynamic> story;

  @override
  Widget build(BuildContext context) {
    final c = context.hc;
    return ClipRRect(
      borderRadius: BorderRadius.circular(16),
      child: ColoredBox(
        color: c.warningBg,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            AspectRatio(
              aspectRatio: 16 / 9,
              child: TreasureImage('${story['imageUrl'] ?? ''}'),
            ),
            Padding(
              padding: const EdgeInsets.all(14),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                spacing: 4,
                children: [
                  Text(
                    'The story of ${story['title']}',
                    style: TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w500,
                      color: c.text,
                    ),
                  ),
                  Text(
                    '${story['backstory']}',
                    style: TextStyle(
                      fontSize: 13,
                      height: 1.5,
                      color: c.warningText,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
