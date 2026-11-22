import 'package:material_ui/material_ui.dart';

/// Loads a deferred library before building its page, so phones that only
/// open `/player` never download Controller or audience code (FE-01).
class DeferredPage extends StatefulWidget {
  const DeferredPage({super.key, required this.loadLibrary, required this.builder});

  final Future<void> Function() loadLibrary;
  final WidgetBuilder builder;

  @override
  State<DeferredPage> createState() => _DeferredPageState();
}

class _DeferredPageState extends State<DeferredPage> {
  late final Future<void> _loaded = widget.loadLibrary();

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<void>(
      future: _loaded,
      builder: (context, snapshot) {
        if (snapshot.hasError) {
          return const Scaffold(body: Center(child: Text('Could not load this screen. Please refresh.')));
        }
        if (snapshot.connectionState != ConnectionState.done) {
          return const Scaffold(body: Center(child: CircularProgressIndicator()));
        }
        return widget.builder(context);
      },
    );
  }
}
