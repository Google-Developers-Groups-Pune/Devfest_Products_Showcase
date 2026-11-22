import 'dart:math' as math;

import 'package:material_ui/material_ui.dart';

/// Starting `expression` list from BE-18. The final list comes from FE-31.
const expressionEmoji = {
  'NEUTRAL': '😐',
  'BORED': '🥱',
  'UNIMPRESSED': '😒',
  'CURIOUS': '🤨',
  'IMPRESSED': '🤩',
  'SHOCKED': '😱',
  'SALUTE': '🫡',
};

/// The guard's face in one audience row. Each row has its own copy.
///
/// Every new prompt ([changeCount] goes up) pops the face in with a bounce and
/// a wobble, so the crowd sees it react even when the expression repeats.
///
/// FE-31 swaps the glyph for the pre-rendered 3D animation of [expression];
/// the rest of the row does not change. Glyphs come from the bundled
/// Noto Color Emoji font, never from the network.
class ExpressionFace extends StatelessWidget {
  const ExpressionFace({
    super.key,
    required this.expression,
    required this.changeCount,
    this.size = 96,
  });

  /// null before the player's first prompt: shows a neutral face.
  final String? expression;
  final int changeCount;
  final double size;

  @override
  Widget build(BuildContext context) {
    final glyph = expressionEmoji[expression] ?? expressionEmoji['NEUTRAL']!;
    return SizedBox(
      width: size * 1.2,
      height: size * 1.2,
      child: Center(
        child: TweenAnimationBuilder<double>(
          // A new key restarts the animation on every prompt.
          key: ValueKey(changeCount),
          tween: Tween(begin: 0, end: 1),
          duration: const Duration(milliseconds: 900),
          builder: (context, t, child) {
            final pop = changeCount == 0
                ? 1.0
                : Curves.elasticOut.transform(t) * 0.5 + 0.5 * t;
            final wobble = changeCount == 0
                ? 0.0
                : math.sin(t * math.pi * 4) * (1 - t) * 0.25;
            return Opacity(
              opacity: expression == null ? 0.35 : 1,
              child: Transform.rotate(
                angle: wobble,
                child: Transform.scale(scale: pop, child: child),
              ),
            );
          },
          child: Text(
            glyph,
            style: TextStyle(
              fontSize: size,
              height: 1,
              fontFamily: 'AppEmoji',
            ),
          ),
        ),
      ),
    );
  }
}
