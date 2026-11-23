import 'package:material_ui/material_ui.dart';

import '../theme/heist_theme.dart';

/// The treasure or story picture, used by the Controller, the display and
/// the phones. A missing or slow image never blocks anything.
///
/// [placeholder] shows while the image loads, and also when it fails unless
/// [error] is given. [onLoaded] runs once the image has shown, so the
/// Controller can unlock Approve (FE-13).
class TreasureImage extends StatefulWidget {
  const TreasureImage(this.url, {super.key, this.placeholder, this.error, this.onLoaded});

  final String url;
  final Widget? placeholder;
  final Widget? error;
  final VoidCallback? onLoaded;

  @override
  State<TreasureImage> createState() => _TreasureImageState();
}

class _TreasureImageState extends State<TreasureImage> {
  bool _reported = false;

  @override
  void didUpdateWidget(TreasureImage old) {
    super.didUpdateWidget(old);
    if (old.url != widget.url) _reported = false;
  }

  void _shown() {
    if (_reported || widget.onLoaded == null) return;
    _reported = true;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) widget.onLoaded!();
    });
  }

  @override
  Widget build(BuildContext context) {
    final c = context.hc;
    final placeholder =
        widget.placeholder ??
        Container(
          color: c.card,
          alignment: Alignment.center,
          child: Icon(Icons.diamond_outlined, size: 48, color: c.warningText),
        );
    final error = widget.error ?? placeholder;
    if (widget.url.isEmpty) return error;
    return Image.network(
      widget.url,
      fit: BoxFit.cover,
      width: double.infinity,
      height: double.infinity,
      webHtmlElementStrategy: WebHtmlElementStrategy.fallback,
      frameBuilder: (_, child, frame, _) {
        if (frame != null) _shown();
        return child;
      },
      loadingBuilder: (_, child, progress) => progress == null ? child : placeholder,
      errorBuilder: (_, _, _) => error,
    );
  }
}
