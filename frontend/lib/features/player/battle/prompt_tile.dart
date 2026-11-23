import 'package:material_ui/material_ui.dart';

import '../../../core/widgets/widgets.dart';
import 'game_state.dart';

/// One submitted prompt: a spinner while it is scored, then a card tinted
/// by the score band, or a red card when it is blocked or failed.
class PromptTile extends StatelessWidget {
  const PromptTile(
    this.p, {
    super.key,
    required this.onRetry,
    required this.onEdit,
  });
  final PromptItem p;
  final VoidCallback onRetry; // failed: send again
  final VoidCallback onEdit; // blocked: put the text back in the input

  @override
  Widget build(BuildContext context) {
    final c = context.hc;
    final title = switch (p.stage) {
      PromptStage.submitting => 'Submitting…',
      PromptStage.evaluating => 'Guard is evaluating…',
      PromptStage.scored => p.feedback ?? 'Scored',
      PromptStage.blocked => p.message ??
          'That prompt cannot be displayed. Try a different game-focused prompt.',
      PromptStage.failed =>
        p.message ?? 'We could not score that one. Please try again.',
    };

    final tone = switch (p.stage) {
      PromptStage.scored => scoreTone(p.score ?? 0),
      PromptStage.blocked || PromptStage.failed => Tone.danger,
      _ => Tone.neutral,
    };
    final (bg, fg) = tone.colors(c);

    final Widget leading = switch (p.stage) {
      PromptStage.scored => _ScoreDot(p.score ?? 0),
      PromptStage.blocked => Icon(Icons.block_rounded, size: 26, color: fg),
      PromptStage.failed => Icon(Icons.error_outline, size: 26, color: fg),
      _ => SizedBox.square(
          dimension: 22,
          child: CircularProgressIndicator(strokeWidth: 2, color: c.accent),
        ),
    };

    final problem = p.stage == PromptStage.blocked || p.stage == PromptStage.failed;

    return Container(
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(16)),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        spacing: 12,
        children: [
          SizedBox.square(dimension: 44, child: Center(child: leading)),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              spacing: 2,
              children: [
                Text(
                  title,
                  style: TextStyle(
                    fontWeight: FontWeight.w500,
                    color: problem ? fg : c.text,
                    height: 1.4,
                  ),
                ),
                Text(
                  p.text,
                  style: TextStyle(color: c.textSecondary, height: 1.4),
                ),
                if (p.stage == PromptStage.failed && p.canRetry)
                  Padding(
                    padding: const EdgeInsets.only(top: 6),
                    child: OutlinedButton(
                      onPressed: onRetry,
                      style: OutlinedButton.styleFrom(
                        foregroundColor: c.dangerText,
                        side: BorderSide(color: c.dangerBorder),
                        minimumSize: const Size(0, 36),
                      ),
                      child: const Text('Retry'),
                    ),
                  ),
                if (p.stage == PromptStage.blocked)
                  TextButton(
                    onPressed: onEdit,
                    style: TextButton.styleFrom(
                      foregroundColor: c.dangerText,
                      minimumSize: const Size(0, 36),
                      padding: const EdgeInsets.symmetric(horizontal: 8),
                    ),
                    child: const Text('Edit prompt'),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// Solid score circle in the score's Google colour.
class _ScoreDot extends StatelessWidget {
  const _ScoreDot(this.score);
  final int score;

  @override
  Widget build(BuildContext context) {
    final color = scoreColor(score);
    return Container(
      width: 44,
      height: 44,
      alignment: Alignment.center,
      decoration: BoxDecoration(color: color, shape: BoxShape.circle),
      child: Text(
        '$score',
        style: context.mono(
          TextStyle(
            fontSize: 16,
            fontWeight: FontWeight.w500,
            color: color == HeistColors.yellow ? HeistColors.ink : Colors.white,
          ),
        ),
      ),
    );
  }
}
