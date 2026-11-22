import 'dart:math' as math;

import 'package:material_ui/material_ui.dart';

import '../theme/heist_theme.dart';

/// A player's colour marker: the slot's shape drawn in its Google colour.
class ShapeAvatar extends StatelessWidget {
  const ShapeAvatar(this.shape, {super.key, this.size = 20});

  final SlotShape shape;
  final double size;

  @override
  Widget build(BuildContext context) {
    final color = shape.color;
    final Widget drawn = switch (shape.kind) {
      ShapeKind.circle => Container(
          width: size,
          height: size,
          decoration: BoxDecoration(color: color, shape: BoxShape.circle),
        ),
      ShapeKind.roundedSquare => Container(
          width: size * 0.9,
          height: size * 0.9,
          decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(size * 0.22)),
        ),
      ShapeKind.diamond => Transform.rotate(
          angle: math.pi / 4,
          child: Container(
            width: size * 0.7,
            height: size * 0.7,
            decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(size * 0.12)),
          ),
        ),
      ShapeKind.pill => Container(
          width: size,
          height: size * 0.56,
          decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(size)),
        ),
    };
    return Semantics(
      label: shape.description,
      child: SizedBox.square(dimension: size, child: Center(child: drawn)),
    );
  }
}
