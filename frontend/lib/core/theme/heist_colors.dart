import 'package:material_ui/material_ui.dart';

/// Prompt Heist palette (FE-26, decisions D11 and D25).
///
/// The four Google logo colours carry meaning everywhere:
/// blue = action and time, green = success, yellow = treasure and attention,
/// red = errors and urgency. Surfaces are the dark background from the design.
@immutable
class HeistColors extends ThemeExtension<HeistColors> {
  const HeistColors({
    required this.page,
    required this.surface,
    required this.card,
    required this.border,
    required this.borderStrong,
    required this.text,
    required this.textSecondary,
    required this.textMuted,
    required this.accent,
    required this.onAccent,
    required this.accentBg,
    required this.accentText,
    required this.successBg,
    required this.successText,
    required this.warningBg,
    required this.warningText,
    required this.dangerBg,
    required this.dangerText,
    required this.dangerBorder,
  });

  // Google logo colours, exactly as in the shared contract.
  static const blue = Color(0xFF4285F4);
  static const red = Color(0xFFEA4335);
  static const yellow = Color(0xFFFBBC05);
  static const green = Color(0xFF34A853);
  static const googleColors = [blue, red, yellow, green];

  /// Text on yellow.
  static const ink = Color(0xFF202124);

  /// Deeper Google shades for full-bleed banners, so white text stays legible.
  static const heroBlue = Color(0xFF1A73E8);
  static const heroGreen = Color(0xFF1E8E3E);

  final Color page;
  final Color surface;
  final Color card;
  final Color border;
  final Color borderStrong;
  final Color text;
  final Color textSecondary;
  final Color textMuted;

  /// Blue: buttons, focus, timer.
  final Color accent;
  final Color onAccent;
  final Color accentBg;
  final Color accentText;

  /// Green: connected, scored, 100.
  final Color successBg;
  final Color successText;

  /// Yellow: treasure, unlock, reconnecting.
  final Color warningBg;
  final Color warningText;

  /// Red: errors, blocked prompts, final seconds.
  final Color dangerBg;
  final Color dangerText;
  final Color dangerBorder;

  /// The dark theme from the mockups. The app has only this one.
  static const dark = HeistColors(
    page: Color(0xFF171717),
    surface: Color(0xFF1E1E1E),
    card: Color(0xFF2A2B2D),
    border: Color(0xFF3C4043),
    borderStrong: Color(0xFF5F6368),
    text: Color(0xFFE8EAED),
    textSecondary: Color(0xFFBDC1C6),
    textMuted: Color(0xFF9AA0A6),
    accent: Color(0xFF8AB4F8),
    onAccent: Color(0xFF062E6F),
    accentBg: Color(0xFF0F2D4A),
    accentText: Color(0xFF57CAFF),
    successBg: Color(0xFF10331A),
    successText: Color(0xFF5CDB6D),
    warningBg: Color(0xFF3A2E0A),
    warningText: Color(0xFFFFD427),
    dangerBg: Color(0xFF3E1A1E),
    dangerText: Color(0xFFF28B82),
    dangerBorder: Color(0xFFF28B82),
  );

  @override
  HeistColors copyWith() => this;

  @override
  HeistColors lerp(HeistColors? other, double t) {
    if (other == null) return this;
    Color l(Color a, Color b) => Color.lerp(a, b, t)!;
    return HeistColors(
      page: l(page, other.page),
      surface: l(surface, other.surface),
      card: l(card, other.card),
      border: l(border, other.border),
      borderStrong: l(borderStrong, other.borderStrong),
      text: l(text, other.text),
      textSecondary: l(textSecondary, other.textSecondary),
      textMuted: l(textMuted, other.textMuted),
      accent: l(accent, other.accent),
      onAccent: l(onAccent, other.onAccent),
      accentBg: l(accentBg, other.accentBg),
      accentText: l(accentText, other.accentText),
      successBg: l(successBg, other.successBg),
      successText: l(successText, other.successText),
      warningBg: l(warningBg, other.warningBg),
      warningText: l(warningText, other.warningText),
      dangerBg: l(dangerBg, other.dangerBg),
      dangerText: l(dangerText, other.dangerText),
      dangerBorder: l(dangerBorder, other.dangerBorder),
    );
  }
}

/// Meaning-based colour pairs (background, foreground) used by chips and cards.
enum Tone { neutral, accent, success, warning, danger }

extension ToneColors on Tone {
  (Color bg, Color fg) colors(HeistColors c) => switch (this) {
        Tone.neutral => (c.card, c.textSecondary),
        Tone.accent => (c.accentBg, c.accentText),
        Tone.success => (c.successBg, c.successText),
        Tone.warning => (c.warningBg, c.warningText),
        Tone.danger => (c.dangerBg, c.dangerText),
      };
}

extension HeistContext on BuildContext {
  HeistColors get hc => Theme.of(this).extension<HeistColors>() ?? HeistColors.dark;

  /// Monospace with tabular figures, for timers, scores and codes.
  TextStyle mono(TextStyle style) => style.copyWith(
        fontFamily: HeistFonts.mono,
        fontFeatures: const [FontFeature.tabularFigures()],
      );
}

/// Bundled font families. Fonts are never fetched at runtime (booth Wi-Fi).
abstract final class HeistFonts {
  static const String sans = 'GoogleSans';
  static const String mono = 'GoogleSansCode';
}
