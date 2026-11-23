import 'package:material_ui/material_ui.dart';

import '../theme/slot_shape.dart';

class ShapeInfo {
  const ShapeInfo(this.name, this.color);
  final String name;
  final Color color;
}

/// Name and colour per API shape value, taken from [SlotShape] so the
/// slot colours are defined once (Google logo colours).
final shapeInfo = <String, ShapeInfo>{
  for (final s in SlotShape.values) s.apiValue: ShapeInfo(s.description, s.color),
};

class ShapeMarker extends StatelessWidget {
  const ShapeMarker(this.shape, {super.key, this.size = 20});
  final String shape;
  final double size;

  @override
  Widget build(BuildContext context) {
    final color = (shapeInfo[shape] ?? shapeInfo['BLUE_CIRCLE']!).color;
    switch (shape) {
      case 'RED_SQUARE':
        return _box(color, size, size, size * 0.28);
      case 'YELLOW_DIAMOND':
        return Transform.rotate(
          angle: 0.785398,
          child: _box(color, size * 0.78, size * 0.78, size * 0.12),
        );
      case 'GREEN_PILL':
        return _box(color, size * 1.7, size * 0.8, size);
      default:
        return _box(color, size, size, size);
    }
  }

  Widget _box(Color c, double w, double h, double r) => Container(
    width: w,
    height: h,
    decoration: BoxDecoration(color: c, borderRadius: BorderRadius.circular(r)),
  );
}
