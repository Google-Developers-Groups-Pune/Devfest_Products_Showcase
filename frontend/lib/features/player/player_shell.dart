import 'package:material_ui/material_ui.dart';

/// Entry point of the `/player` route: phone join, lobby, battle and result flow.
/// Screens arrive in FE-05 to FE-10.
class PlayerShell extends StatelessWidget {
  const PlayerShell({super.key});

  @override
  Widget build(BuildContext context) {
    return const Scaffold(body: Center(child: Text('Player')));
  }
}
