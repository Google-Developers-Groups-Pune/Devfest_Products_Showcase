import 'package:material_ui/material_ui.dart';

import 'heist_colors.dart';

enum ShapeKind { circle, roundedSquare, diamond, pill }

/// Colour marker fixed by slot (shared contract). Only tells players apart.
enum SlotShape {
  blueCircle('BLUE_CIRCLE', HeistColors.blue, ShapeKind.circle, Tone.accent, 'blue circle'),
  redSquare('RED_SQUARE', HeistColors.red, ShapeKind.roundedSquare, Tone.danger, 'red square'),
  yellowDiamond('YELLOW_DIAMOND', HeistColors.yellow, ShapeKind.diamond, Tone.warning, 'yellow diamond'),
  greenPill('GREEN_PILL', HeistColors.green, ShapeKind.pill, Tone.success, 'green pill'),
  greenCircle('GREEN_CIRCLE', HeistColors.green, ShapeKind.circle, Tone.success, 'green circle');

  const SlotShape(this.apiValue, this.color, this.kind, this.tone, this.description);

  /// Value of `shape` in API payloads.
  final String apiValue;
  final Color color;
  final ShapeKind kind;
  final Tone tone;

  /// Plain words, for screen readers and "Your shape: blue circle".
  final String description;

  /// Text colour that stays readable on [color].
  Color get onColor => this == yellowDiamond ? HeistColors.ink : const Color(0xFFFFFFFF);

  static SlotShape forSlot(int slotNumber) => values[(slotNumber - 1) % values.length];

  static SlotShape fromApi(String value) =>
      values.firstWhere((s) => s.apiValue == value, orElse: () => throw ArgumentError.value(value, 'shape'));
}
