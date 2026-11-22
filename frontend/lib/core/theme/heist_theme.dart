import 'package:material_ui/material_ui.dart';

import 'heist_colors.dart';

export 'heist_colors.dart';
export 'score_colors.dart';
export 'slot_shape.dart';

/// The app theme: dark background from the design, Google logo accents,
/// pill-shaped buttons. Used by every route.
ThemeData buildHeistTheme() {
  const c = HeistColors.dark;
  final base = ThemeData(
    useMaterial3: true,
    brightness: Brightness.dark,
    fontFamily: HeistFonts.sans,
    colorScheme: ColorScheme.fromSeed(seedColor: HeistColors.blue, brightness: Brightness.dark).copyWith(
      primary: c.accent,
      onPrimary: c.onAccent,
      secondary: HeistColors.green,
      tertiary: HeistColors.yellow,
      surface: c.surface,
      onSurface: c.text,
      error: c.dangerBorder,
      outline: c.borderStrong,
    ),
    scaffoldBackgroundColor: c.page,
    extensions: const [c],
  );

  OutlineInputBorder border(Color color, [double width = 1]) => OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: BorderSide(color: color, width: width),
      );

  return base.copyWith(
    textTheme: base.textTheme.apply(bodyColor: c.text, displayColor: c.text),
    inputDecorationTheme: InputDecorationTheme(
      isDense: true,
      filled: true,
      fillColor: c.surface,
      contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 13),
      hintStyle: TextStyle(color: c.textMuted),
      border: border(c.borderStrong),
      enabledBorder: border(c.borderStrong),
      focusedBorder: border(c.accent, 2),
      errorBorder: border(c.dangerBorder),
      focusedErrorBorder: border(c.dangerBorder, 2),
      disabledBorder: border(c.border),
      errorStyle: TextStyle(color: c.dangerText, fontSize: 12, height: 1.4),
      errorMaxLines: 3,
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        backgroundColor: c.accent,
        foregroundColor: c.onAccent,
        minimumSize: const Size(64, 48),
        shape: const StadiumBorder(),
        textStyle: const TextStyle(fontSize: 15, fontWeight: FontWeight.w500, fontFamily: HeistFonts.sans),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        foregroundColor: c.accent,
        minimumSize: const Size(64, 46),
        side: BorderSide(color: c.borderStrong),
        shape: const StadiumBorder(),
        textStyle: const TextStyle(fontSize: 14, fontWeight: FontWeight.w500, fontFamily: HeistFonts.sans),
      ),
    ),
    textButtonTheme: TextButtonThemeData(style: TextButton.styleFrom(shape: const StadiumBorder())),
    dialogTheme: DialogThemeData(
      backgroundColor: c.surface,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
    ),
    progressIndicatorTheme: ProgressIndicatorThemeData(color: c.accent, linearTrackColor: c.border),
    dividerTheme: DividerThemeData(color: c.border, space: 1),
  );
}

/// Applies the dark Heist theme to one surface (the Controller and gallery).
/// The player and audience routes keep their own look.
class HeistThemeScope extends StatelessWidget {
  const HeistThemeScope({super.key, required this.child});

  final Widget child;

  static final ThemeData _theme = buildHeistTheme();

  @override
  Widget build(BuildContext context) => Theme(
        data: _theme,
        child: ColoredBox(
          color: HeistColors.dark.page,
          child: DefaultTextStyle(
            style: TextStyle(color: HeistColors.dark.text, fontFamily: HeistFonts.sans),
            child: child,
          ),
        ),
      );
}
