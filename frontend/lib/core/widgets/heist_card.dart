import 'package:material_ui/material_ui.dart';

import '../theme/heist_theme.dart';

/// The story's `Card`: a rounded panel with an optional title row.
///
/// Named `HeistCard` so it does not clash with Material's `Card`.
/// With a [tone] other than neutral it becomes a tinted callout, like the
/// yellow treasure card on the big screen.
class HeistCard extends StatelessWidget {
  const HeistCard({
    super.key,
    this.title,
    this.subtitle,
    this.trailing,
    required this.child,
    this.tone = Tone.neutral,
    this.padding = const EdgeInsets.all(20),
  });

  final String? title;
  final String? subtitle;
  final Widget? trailing;
  final Widget child;
  final Tone tone;
  final EdgeInsets padding;

  @override
  Widget build(BuildContext context) {
    final c = context.hc;
    final neutral = tone == Tone.neutral;
    final (bg, fg) = tone.colors(c);
    final hasHeader = title != null || trailing != null;
    return Container(
      padding: padding,
      decoration: BoxDecoration(
        color: neutral ? c.surface : bg,
        borderRadius: BorderRadius.circular(24),
        border: neutral ? Border.all(color: c.border) : null,
      ),
      child: DefaultTextStyle.merge(
        style: TextStyle(color: neutral ? c.text : fg, height: 1.4),
        child: IconTheme.merge(
          data: IconThemeData(color: neutral ? c.textSecondary : fg),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            spacing: 16,
            children: [
              if (hasHeader)
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  spacing: 12,
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        spacing: 2,
                        children: [
                          if (title != null)
                            Text(title!, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w500)),
                          if (subtitle != null)
                            Text(subtitle!, style: TextStyle(color: neutral ? c.textSecondary : fg)),
                        ],
                      ),
                    ),
                    ?trailing,
                  ],
                ),
              child,
            ],
          ),
        ),
      ),
    );
  }
}

/// Icon and text on one line, for notes inside cards.
class IconLine extends StatelessWidget {
  const IconLine(this.icon, this.text, {super.key, this.tone});

  final IconData icon;
  final String text;
  final Tone? tone;

  @override
  Widget build(BuildContext context) {
    final fg = tone?.colors(context.hc).$2;
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      spacing: 8,
      children: [
        Padding(padding: const EdgeInsets.only(top: 1), child: Icon(icon, size: 18, color: fg)),
        Expanded(child: Text(text, style: fg == null ? null : TextStyle(color: fg))),
      ],
    );
  }
}
