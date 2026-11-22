import 'package:material_ui/material_ui.dart';

/// Entry point of the `/audience` route: the public big screen ("display" in the API).
/// Loaded with a deferred import. Screens arrive in FE-19 to FE-23.
class AudienceShell extends StatelessWidget {
  const AudienceShell({super.key});

  @override
  Widget build(BuildContext context) {
    return const Scaffold(body: Center(child: Text('Audience')));
  }
}
