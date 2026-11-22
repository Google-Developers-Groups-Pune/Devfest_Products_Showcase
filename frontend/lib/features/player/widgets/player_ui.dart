import 'package:material_ui/material_ui.dart';

import '../../../core/widgets/widgets.dart';

/// Layout pieces for the player screens, following the Google / DevFest
/// design used by the Controller. Colours always come from [HeistColors].

/// Deeper Google shades for full-bleed banners, so white text stays legible.
const heroBlue = Color(0xFF1A73E8);
const heroGreen = Color(0xFF1E8E3E);

/// The slot shape for an API value, falling back to blue circle.
SlotShape slotShapeOf(String? apiValue) {
  try {
    return SlotShape.fromApi(apiValue ?? '');
  } catch (_) {
    return SlotShape.blueCircle;
  }
}

/// Phone-width page: optional fixed [top], a scrolling body, and actions
/// pinned at the bottom near the thumb. The Google stripe sits on top
/// unless a [header] banner replaces it.
class PlayerPage extends StatelessWidget {
  const PlayerPage({
    super.key,
    this.header,
    this.top,
    required this.content,
    this.bottom = const [],
  });

  final Widget? header;
  final Widget? top;
  final List<Widget> content;
  final List<Widget> bottom;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Column(
          children: [
            header ?? const TopStripe(),
            Expanded(
              child: Center(
                child: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 460),
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      spacing: 12,
                      children: [
                        ?top,
                        Expanded(
                          child: SingleChildScrollView(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.stretch,
                              spacing: 12,
                              children: content,
                            ),
                          ),
                        ),
                        ...bottom,
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Centred spinner or error, on the player background.
class PlayerLoading extends StatelessWidget {
  const PlayerLoading({super.key, this.message, this.onRetry});

  /// Shown instead of the spinner when set.
  final String? message;
  final VoidCallback? onRetry;

  @override
  Widget build(BuildContext context) {
    final c = context.hc;
    return Scaffold(
      body: SafeArea(
        child: Column(
          children: [
            const TopStripe(),
            Expanded(
              child: Center(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  spacing: 12,
                  children: [
                    if (message == null)
                      const CircularProgressIndicator()
                    else
                      Text(message!, textAlign: TextAlign.center, style: TextStyle(color: c.textSecondary)),
                    if (onRetry != null) OutlinedButton(onPressed: onRetry, child: const Text('Try again')),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Back pill on the left, optional trailing widget (step dots) on the right.
class PlayerTopBar extends StatelessWidget {
  const PlayerTopBar({super.key, this.onBack, this.trailing});

  static const _inset = 10.0;

  final VoidCallback? onBack;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    final c = context.hc;
    return SizedBox(
      height: 40,
      child: Row(
        children: [
          if (onBack != null)
            // Shifted left so the arrow lines up with the page content.
            Transform.translate(
              offset: const Offset(-_inset, 0),
              child: TextButton.icon(
                onPressed: onBack,
                style: TextButton.styleFrom(
                  foregroundColor: c.text,
                  minimumSize: const Size(0, 40),
                  padding: const EdgeInsets.fromLTRB(_inset, 0, 14, 0),
                  textStyle: const TextStyle(fontSize: 14, fontWeight: FontWeight.w500, fontFamily: HeistFonts.sans),
                ),
                icon: const Icon(Icons.arrow_back, size: 20),
                label: const Text('Back'),
              ),
            ),
          const Spacer(),
          ?trailing,
        ],
      ),
    );
  }
}

class PageTitle extends StatelessWidget {
  const PageTitle(this.title, {super.key, this.subtitle});

  final String title;
  final String? subtitle;

  @override
  Widget build(BuildContext context) {
    final c = context.hc;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      spacing: 4,
      children: [
        Text(title, style: TextStyle(fontSize: 22, fontWeight: FontWeight.w500, color: c.text)),
        if (subtitle != null)
          Text(subtitle!, style: TextStyle(fontSize: 14, color: c.textSecondary, height: 1.5)),
      ],
    );
  }
}

/// Small muted label above a text field.
class InputLabel extends StatelessWidget {
  const InputLabel(this.text, {super.key});

  final String text;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(bottom: 4),
        child: Text(text, style: TextStyle(fontSize: 12, color: context.hc.textSecondary)),
      );
}

/// A label with its text field.
class LabelledField extends StatelessWidget {
  const LabelledField({super.key, required this.label, required this.field});

  final String label;
  final Widget field;

  @override
  Widget build(BuildContext context) => Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [InputLabel(label), field],
      );
}

/// Tinted rounded box for notes, errors and callouts.
class InfoCard extends StatelessWidget {
  const InfoCard({super.key, required this.child, this.tone = Tone.neutral, this.padding});

  final Widget child;
  final Tone tone;
  final EdgeInsets? padding;

  @override
  Widget build(BuildContext context) {
    final c = context.hc;
    final (bg, fg) = tone.colors(c);
    return Container(
      padding: padding ?? const EdgeInsets.all(12),
      decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(16)),
      child: DefaultTextStyle.merge(
        style: TextStyle(color: tone == Tone.neutral ? c.text : fg, fontSize: 13, height: 1.5),
        child: IconTheme.merge(data: IconThemeData(color: fg, size: 18), child: child),
      ),
    );
  }
}

/// Full-width primary action with a busy spinner.
class PrimaryButton extends StatelessWidget {
  const PrimaryButton({super.key, required this.label, this.onPressed, this.busy = false});

  final String label;
  final VoidCallback? onPressed;
  final bool busy;

  @override
  Widget build(BuildContext context) => FilledButton(
        onPressed: busy ? null : onPressed,
        child: busy
            ? SizedBox.square(
                dimension: 18,
                child: CircularProgressIndicator(strokeWidth: 2, color: context.hc.onAccent),
              )
            : Text(label),
      );
}

/// Progress through a short flow, as filled pills.
class StepDots extends StatelessWidget {
  const StepDots({super.key, required this.current, required this.total});

  final int current;
  final int total;

  @override
  Widget build(BuildContext context) {
    final c = context.hc;
    return Row(
      mainAxisSize: MainAxisSize.min,
      spacing: 4,
      children: [
        for (var i = 1; i <= total; i++)
          AnimatedContainer(
            duration: const Duration(milliseconds: 200),
            width: i == current ? 22 : 10,
            height: 6,
            decoration: BoxDecoration(
              color: i <= current ? c.accent : c.border,
              borderRadius: BorderRadius.circular(999),
            ),
          ),
      ],
    );
  }
}

/// Bold Google-colour banner with floating shapes in the other colours.
class HeroBanner extends StatelessWidget {
  const HeroBanner({
    super.key,
    required this.color,
    required this.child,
    this.padding = const EdgeInsets.fromLTRB(20, 28, 20, 32),
  });

  final Color color;
  final Widget child;
  final EdgeInsets padding;

  @override
  Widget build(BuildContext context) {
    // A hero shade counts as its logo colour, so a blue hero gets no blue blob.
    final base = switch (color) {
      heroBlue => HeistColors.blue,
      heroGreen => HeistColors.green,
      _ => color,
    };
    final others = HeistColors.googleColors.where((c) => c != base).toList();
    return ColoredBox(
      color: color,
      child: Stack(
        clipBehavior: Clip.hardEdge,
        children: [
          Positioned(left: -22, top: 18, child: _blob(others[0], 72, ShapeKind.circle)),
          Positioned(
            right: 20,
            top: 14,
            child: Transform.rotate(angle: 0.32, child: _blob(others[1], 52, ShapeKind.roundedSquare)),
          ),
          Positioned(right: -24, bottom: 18, child: _blob(others[2], 92, ShapeKind.pill)),
          Padding(
            padding: padding,
            child: Center(
              child: DefaultTextStyle.merge(style: const TextStyle(color: Colors.white), child: child),
            ),
          ),
        ],
      ),
    );
  }

  static Widget _blob(Color color, double size, ShapeKind kind) => Container(
        width: size,
        height: kind == ShapeKind.pill ? size * 0.38 : size,
        decoration: BoxDecoration(
          color: color,
          shape: kind == ShapeKind.circle ? BoxShape.circle : BoxShape.rectangle,
          borderRadius: switch (kind) {
            ShapeKind.circle => null,
            ShapeKind.pill => BorderRadius.circular(size),
            _ => BorderRadius.circular(size * 0.26),
          },
        ),
      );
}

/// Treasure or story picture. A missing or slow image never blocks anything.
class TreasureImage extends StatelessWidget {
  const TreasureImage(this.url, {super.key});

  final String url;

  @override
  Widget build(BuildContext context) {
    final c = context.hc;
    final placeholder = Container(
      color: c.card,
      alignment: Alignment.center,
      child: Icon(Icons.diamond_outlined, size: 48, color: c.warningText),
    );
    if (url.isEmpty) return placeholder;
    return Image.network(
      url,
      fit: BoxFit.cover,
      width: double.infinity,
      webHtmlElementStrategy: WebHtmlElementStrategy.fallback,
      loadingBuilder: (_, child, progress) => progress == null ? child : placeholder,
      errorBuilder: (_, _, _) => placeholder,
    );
  }
}
