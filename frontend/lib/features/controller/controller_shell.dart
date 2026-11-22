import 'package:material_ui/material_ui.dart';

/// Entry point of the `/controller` route: the restricted booth dashboard.
/// Loaded with a deferred import. Screens arrive in FE-11 to FE-18, FE-27, FE-28.
class ControllerShell extends StatelessWidget {
  const ControllerShell({super.key});

  @override
  Widget build(BuildContext context) {
    return const Scaffold(body: Center(child: Text('Controller')));
  }
}
