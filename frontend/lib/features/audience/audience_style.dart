import 'package:material_ui/material_ui.dart';

import '../../core/theme/heist_colors.dart';

export '../../core/theme/heist_colors.dart' show HeistColors;

/// Dark projector palette for the audience screen, from the display mocks.
/// Every size is in stage pixels: the stage is 1920x1080, scaled to fit.
abstract final class Stage {
  static const width = 1920.0;
  static const height = 1080.0;

  static const background = Color(0xFF1A1A1A);
  static const card = Color(0xFF242526);
  static const border = Color(0xFF3C4043);
  static const text = Color(0xFFF1F3F4);
  static const muted = Color(0xFF9AA0A6);

  // The Google logo colours, from the shared theme.
  static const blue = HeistColors.blue;
  static const red = HeistColors.red;
  static const yellow = HeistColors.yellow;
  static const green = HeistColors.green;
  static const googleColors = [blue, red, yellow, green];

  /// Dark tint of a marker colour, for pills and highlighted rows.
  static Color tint(Color c) => Color.alphaBlend(c.withValues(alpha: 0.22), card);

  /// Lighter version of a marker colour, readable as text on [background].
  static Color light(Color c) => Color.lerp(c, Colors.white, 0.35)!;
}

/// The four-colour Google stripe along the top edge.
class GoogleStripe extends StatelessWidget {
  const GoogleStripe({super.key, this.height = 10});
  final double height;

  @override
  Widget build(BuildContext context) => Row(
    children: [
      for (final c in Stage.googleColors)
        Expanded(child: Container(height: height, color: c)),
    ],
  );
}
