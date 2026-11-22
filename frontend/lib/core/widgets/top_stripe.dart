import 'package:material_ui/material_ui.dart';

import '../theme/heist_theme.dart';

/// The four Google colours as a thin bar across the top of every screen.
class TopStripe extends StatelessWidget {
  const TopStripe({super.key, this.height = 4});

  final double height;

  @override
  Widget build(BuildContext context) => SizedBox(
        height: height,
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [for (final color in HeistColors.googleColors) Expanded(child: ColoredBox(color: color))],
        ),
      );
}

/// Four Google-coloured dots, used beside the game name in headers.
class StripeDots extends StatelessWidget {
  const StripeDots({super.key, this.size = 10});

  final double size;

  @override
  Widget build(BuildContext context) => Row(
        mainAxisSize: MainAxisSize.min,
        spacing: size * 0.6,
        children: [
          for (final color in HeistColors.googleColors)
            Container(
              width: size,
              height: size,
              decoration: BoxDecoration(color: color, shape: BoxShape.circle),
            ),
        ],
      );
}
