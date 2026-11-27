import 'package:material_ui/material_ui.dart';

import '../theme/heist_theme.dart';
import 'top_stripe.dart';

/// One template for the simple designed-by-dev screens: kicked, closed,
/// idle, round cancelled, signed in elsewhere, and so on.
///
/// Works on a phone and on the big screen: content is centred and capped
/// in width, and [large] scales the text up for the projector.
class MessageScreen extends StatelessWidget {
  const MessageScreen({
    super.key,
    required this.icon,
    required this.title,
    this.message,
    this.tone = Tone.accent,
    this.actionLabel,
    this.onAction,
    this.footer,
    this.large = false,
  });

  final IconData icon;
  final String title;
  final String? message;
  final Tone tone;
  final String? actionLabel;
  final VoidCallback? onAction;

  /// Small muted text pinned at the bottom, for example "Keep this page open".
  final String? footer;

  /// Projector sizing for the audience screen.
  final bool large;

  @override
  Widget build(BuildContext context) {
    final c = context.hc;
    final (bg, fg) = tone.colors(c);
    final scale = large ? 2.0 : 1.0;
    return Scaffold(
      body: SafeArea(
        child: Column(
          children: [
            const TopStripe(),
            Expanded(
              child: Center(
                child: SingleChildScrollView(
                  padding: const EdgeInsets.all(24),
                  child: ConstrainedBox(
                    constraints: BoxConstraints(maxWidth: 460 * scale),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      spacing: 16 * scale,
                      children: [
                        Container(
                          width: 72 * scale,
                          height: 72 * scale,
                          decoration: BoxDecoration(color: bg, shape: BoxShape.circle),
                          child: Icon(icon, color: fg, size: 36 * scale),
                        ),
                        Text(
                          title,
                          textAlign: TextAlign.center,
                          style: TextStyle(fontSize: 26 * scale, fontWeight: FontWeight.w500, color: c.text),
                        ),
                        if (message != null)
                          Text(
                            message!,
                            textAlign: TextAlign.center,
                            style: TextStyle(fontSize: 15 * scale, height: 1.5, color: c.textSecondary),
                          ),
                        if (actionLabel != null) ...[
                          SizedBox(height: 8 * scale),
                          FilledButton(onPressed: onAction, child: Text(actionLabel!)),
                        ],
                      ],
                    ),
                  ),
                ),
              ),
            ),
            if (footer != null)
              Padding(
                padding: const EdgeInsets.fromLTRB(24, 0, 24, 20),
                child: Text(
                  footer!,
                  textAlign: TextAlign.center,
                  style: TextStyle(fontSize: 12 * scale, color: c.textMuted),
                ),
              ),
          ],
        ),
      ),
    );
  }
}
