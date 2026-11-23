import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:material_ui/material_ui.dart';

import '../../core/theme/score_colors.dart';
import '../../core/timer/countdown.dart';
import '../../core/widgets/shape_marker.dart';
import '../../core/widgets/treasure_image.dart';
import 'audience_state.dart';
import 'audience_style.dart';
import 'expression_face.dart';

/// FE-21 and FE-22: the screen the crowd watches during the round.
///
/// Layout (1920x1080 stage): title and timer on top, the challenge card on
/// the left, five rows sorted by best score on the right, and the unlock
/// banner along the bottom once someone reaches 100.
class AudienceBattle extends StatelessWidget {
  const AudienceBattle({super.key, required this.state});
  final AudienceState state;

  @override
  Widget build(BuildContext context) {
    final rows = rankedRows(state.players);
    return Padding(
      padding: const EdgeInsets.fromLTRB(64, 28, 64, 28),
      child: Column(
        children: [
          SizedBox(
            height: 112,
            child: Row(
              children: [
                Expanded(
                  child: FittedBox(
                    fit: BoxFit.scaleDown,
                    alignment: Alignment.centerLeft,
                    child: Text(
                      state.treasure?.title ?? 'Prompt Heist',
                      style: const TextStyle(
                        fontSize: 72,
                        fontWeight: FontWeight.w600,
                        color: Stage.text,
                      ),
                    ),
                  ),
                ),
                const SizedBox(width: 32),
                const StageTimer(),
              ],
            ),
          ),
          const SizedBox(height: 24),
          Expanded(
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                SizedBox(
                  width: 470,
                  child: _ChallengeCard(state.treasure),
                ),
                const SizedBox(width: 28),
                Expanded(
                  child: Column(
                    children: [
                      for (var i = 0; i < rows.length; i++) ...[
                        if (i > 0) const SizedBox(height: 14),
                        Expanded(child: AudienceRow(player: rows[i])),
                      ],
                      // Keep five row heights even if fewer players joined.
                      for (var i = rows.length; i < 5; i++) ...[
                        const SizedBox(height: 14),
                        const Expanded(child: SizedBox()),
                      ],
                    ],
                  ),
                ),
              ],
            ),
          ),
          if (state.unlocked.isNotEmpty) ...[
            const SizedBox(height: 20),
            UnlockBanner(unlocked: state.unlocked),
          ],
        ],
      ),
    );
  }
}

/// Server-synced round timer (FE-03). Turns red at 00:00.
class StageTimer extends ConsumerWidget {
  const StageTimer({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = ref.watch(displayCountdownProvider);
    final red = c.expired;
    final color = red ? Stage.red : Stage.light(Stage.blue);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 40, vertical: 8),
      decoration: BoxDecoration(
        color: red ? Stage.tint(Stage.red) : Stage.tint(Stage.blue),
        borderRadius: BorderRadius.circular(80),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.timer_outlined, size: 64, color: color),
          const SizedBox(width: 16),
          Text(
            c.active ? c.label : '--:--',
            style: TextStyle(
              fontFamily: 'AppMono',
              fontSize: 96,
              height: 1.1,
              fontWeight: FontWeight.w600,
              color: color,
            ),
          ),
          if (c.reconnecting) ...[
            const SizedBox(width: 16),
            const Text(
              'Reconnecting…',
              style: TextStyle(fontSize: 28, color: Stage.yellow),
            ),
          ],
        ],
      ),
    );
  }
}

class _ChallengeCard extends StatelessWidget {
  const _ChallengeCard(this.treasure);
  final AudienceTreasure? treasure;

  @override
  Widget build(BuildContext context) {
    final t = treasure;
    return Container(
      padding: const EdgeInsets.all(32),
      decoration: BoxDecoration(
        color: Stage.tint(Stage.yellow),
        borderRadius: BorderRadius.circular(28),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const FittedBox(
            fit: BoxFit.scaleDown,
            alignment: Alignment.centerLeft,
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(Icons.diamond_outlined, size: 48, color: Stage.yellow),
                SizedBox(width: 14),
                Text(
                  'The challenge',
                  style: TextStyle(fontSize: 30, color: Stage.yellow),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),
          // Objective, image, backstory: each shrinks to fit, never cut off.
          Flexible(
            flex: 4,
            child: _FitText(
              t?.lockObjective ?? '',
              style: const TextStyle(
                fontSize: 36,
                height: 1.3,
                color: Stage.text,
              ),
            ),
          ),
          const SizedBox(height: 20),
          // The treasure image sits in the spare space between the objective
          // and the backstory. A missing image shows a placeholder.
          Expanded(
            flex: 4,
            child: Center(
              child: AspectRatio(
                aspectRatio: 1,
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(20),
                  child: TreasureImage(t?.imageUrl ?? '', placeholder: const _ImagePlaceholder()),
                ),
              ),
            ),
          ),
          const SizedBox(height: 20),
          Flexible(
            flex: 3,
            child: _FitText(
              t?.backstory ?? '',
              style: TextStyle(
                fontSize: 24,
                height: 1.35,
                color: Stage.light(Stage.yellow),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _ImagePlaceholder extends StatelessWidget {
  const _ImagePlaceholder();

  @override
  Widget build(BuildContext context) => Container(
    color: Stage.tint(Stage.yellow),
    alignment: Alignment.center,
    child: const FractionallySizedBox(
      widthFactor: 0.4,
      heightFactor: 0.4,
      child: FittedBox(
        child: Icon(Icons.lock_outline, color: Stage.yellow),
      ),
    ),
  );
}

/// One player row: marker, label, face, latest prompt and reaction, score.
class AudienceRow extends StatelessWidget {
  const AudienceRow({super.key, required this.player});
  final AudiencePlayer player;

  @override
  Widget build(BuildContext context) {
    final p = player;
    final marker = (shapeInfo[p.shape] ?? shapeInfo['BLUE_CIRCLE']!).color;
    return AnimatedContainer(
      duration: const Duration(milliseconds: 250),
      padding: const EdgeInsets.symmetric(horizontal: 28, vertical: 10),
      decoration: BoxDecoration(
        color: p.unlocked ? Stage.tint(Stage.green) : Stage.card,
        borderRadius: BorderRadius.circular(28),
        border: Border.all(
          color: p.unlocked ? Stage.green : Stage.border,
          width: p.unlocked ? 4 : 2,
        ),
      ),
      child: Opacity(
        opacity: p.disconnected ? 0.6 : 1,
        child: Row(
          children: [
            ShapeMarker(p.shape, size: 44),
            const SizedBox(width: 24),
            SizedBox(width: 270, child: _LabelColumn(p)),
            const SizedBox(width: 8),
            ExpressionFace(
              expression: p.expression,
              changeCount: p.feedCount,
              size: 84,
            ),
            const SizedBox(width: 20),
            Expanded(child: _PromptAndReaction(p, marker)),
            const SizedBox(width: 24),
            SizedBox(width: 170, child: _Score(p.bestScore)),
          ],
        ),
      ),
    );
  }
}

/// Splits "Meera (Player 5)" into the name and its "(Player 5)" suffix.
/// The suffix is the only thing telling two Meeras apart, so it gets its own
/// line and is never cut off. Only the name part may shorten.
(String, String?) splitLabel(String label) {
  final m = RegExp(r'^(.*\S)\s+(\(Player \d+\))$').firstMatch(label);
  return m == null ? (label, null) : (m.group(1)!, m.group(2));
}

class _LabelColumn extends StatelessWidget {
  const _LabelColumn(this.p);
  final AudiencePlayer p;

  @override
  Widget build(BuildContext context) {
    final (name, suffix) = splitLabel(p.label);
    // Shrinks as a whole when the row is short, so the suffix and the badge
    // always stay visible.
    return FittedBox(
      fit: BoxFit.scaleDown,
      alignment: Alignment.centerLeft,
      child: SizedBox(
        width: 270,
        child: _column(name, suffix),
      ),
    );
  }

  Widget _column(String name, String? suffix) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          name,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: const TextStyle(
            fontSize: 40,
            fontWeight: FontWeight.w500,
            color: Stage.text,
          ),
        ),
        if (suffix != null)
          Text(
            suffix,
            style: const TextStyle(fontSize: 30, color: Stage.muted),
          ),
        if (p.unlocked)
          const _Badge('Unlocked!', Stage.green)
        else if (p.disconnected)
          const _Badge('Disconnected', Stage.muted),
      ],
    );
  }
}

class _Badge extends StatelessWidget {
  const _Badge(this.text, this.color);
  final String text;
  final Color color;

  @override
  Widget build(BuildContext context) => Container(
    margin: const EdgeInsets.only(top: 6),
    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 3),
    decoration: BoxDecoration(
      color: Stage.tint(color),
      borderRadius: BorderRadius.circular(20),
      border: Border.all(color: color, width: 2),
    ),
    child: Text(
      text,
      style: TextStyle(
        fontSize: 24,
        fontWeight: FontWeight.w700,
        color: Stage.light(color),
      ),
    ),
  );
}

/// Full prompt and full reaction (decision D46): the text wraps at the real
/// width and the whole block shrinks only if it is too tall. Never cut off.
class _PromptAndReaction extends StatelessWidget {
  const _PromptAndReaction(this.p, this.marker);
  final AudiencePlayer p;
  final Color marker;

  @override
  Widget build(BuildContext context) {
    if (p.text == null) {
      return const Align(
        alignment: Alignment.centerLeft,
        child: Text(
          'Waiting for the first prompt…',
          style: TextStyle(fontSize: 30, color: Stage.muted),
        ),
      );
    }
    return LayoutBuilder(
      builder: (context, box) => FittedBox(
        fit: BoxFit.scaleDown,
        alignment: Alignment.centerLeft,
        child: SizedBox(
          width: box.maxWidth,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                '“${p.text}”',
                style: const TextStyle(
                  fontSize: 30,
                  height: 1.25,
                  fontStyle: FontStyle.italic,
                  color: Stage.text,
                ),
              ),
              if (p.reaction != null) ...[
                const SizedBox(height: 8),
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 16,
                    vertical: 6,
                  ),
                  decoration: BoxDecoration(
                    color: Stage.tint(marker),
                    borderRadius: BorderRadius.circular(24),
                  ),
                  child: Text(
                    p.reaction!,
                    style: const TextStyle(
                      fontSize: 28,
                      height: 1.25,
                      color: Stage.text,
                    ),
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class _Score extends StatelessWidget {
  const _Score(this.best);
  final int? best;

  @override
  Widget build(BuildContext context) {
    final color = best == null ? Stage.muted : scoreColor(best!);
    return Column(
      mainAxisAlignment: MainAxisAlignment.center,
      crossAxisAlignment: CrossAxisAlignment.end,
      children: [
        FittedBox(
          fit: BoxFit.scaleDown,
          child: Text(
            best == null ? '–' : '$best',
            style: TextStyle(
              fontFamily: 'AppMono',
              fontSize: 76,
              height: 1.1,
              fontWeight: FontWeight.w600,
              color: color,
            ),
          ),
        ),
        const SizedBox(height: 8),
        ClipRRect(
          borderRadius: BorderRadius.circular(8),
          child: LinearProgressIndicator(
            value: ((best ?? 0) / 100).clamp(0.0, 1.0),
            minHeight: 12,
            color: color,
            backgroundColor: Stage.border,
          ),
        ),
      ],
    );
  }
}

/// FE-22: celebrates a 100 without implying the game is over.
class UnlockBanner extends StatelessWidget {
  const UnlockBanner({super.key, required this.unlocked});
  final List<String> unlocked;

  @override
  Widget build(BuildContext context) => Container(
    width: double.infinity,
    padding: const EdgeInsets.symmetric(horizontal: 32, vertical: 18),
    decoration: BoxDecoration(
      color: Stage.tint(Stage.green),
      borderRadius: BorderRadius.circular(20),
    ),
    child: Row(
      children: [
        const Icon(Icons.lock_open, size: 44, color: Stage.green),
        const SizedBox(width: 20),
        Expanded(
          child: FittedBox(
            fit: BoxFit.scaleDown,
            alignment: Alignment.centerLeft,
            child: Text(
              unlockBanner(unlocked),
              style: const TextStyle(fontSize: 34, color: Stage.text),
            ),
          ),
        ),
      ],
    ),
  );
}

/// Text that wraps at its real width and shrinks only if it is too tall.
class _FitText extends StatelessWidget {
  const _FitText(this.text, {required this.style});
  final String text;
  final TextStyle style;

  @override
  Widget build(BuildContext context) => LayoutBuilder(
    builder: (context, box) => FittedBox(
      fit: BoxFit.scaleDown,
      alignment: Alignment.topLeft,
      child: SizedBox(
        width: box.maxWidth,
        child: Text(text, style: style),
      ),
    ),
  );
}
