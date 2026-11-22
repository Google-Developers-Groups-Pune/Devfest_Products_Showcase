import 'package:material_ui/material_ui.dart';

import 'heist_colors.dart';

/// The single source of score colours (FE-26, D25):
/// 0–39 red, 40–79 yellow, 80–99 blue, 100 green. A null score is neutral.
Tone scoreTone(int? score) {
  if (score == null) return Tone.neutral;
  if (score >= 100) return Tone.success;
  if (score >= 80) return Tone.accent;
  if (score >= 40) return Tone.warning;
  return Tone.danger;
}

/// Solid Google logo colour for a score, for bars and big numbers.
Color scoreColor(int? score) => switch (scoreTone(score)) {
      Tone.success => HeistColors.green,
      Tone.accent => HeistColors.blue,
      Tone.warning => HeistColors.yellow,
      Tone.danger => HeistColors.red,
      Tone.neutral => HeistColors.dark.textMuted,
    };
