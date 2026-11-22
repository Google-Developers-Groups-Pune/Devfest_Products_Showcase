import 'package:material_ui/material_ui.dart';
import 'package:go_router/go_router.dart';

import '../../../core/widgets/widgets.dart';

class KickedPage extends StatelessWidget {
  const KickedPage({super.key});

  @override
  Widget build(BuildContext context) => MessageScreen(
    icon: Icons.devices_other_rounded,
    tone: Tone.warning,
    title: 'You joined on another device',
    message: 'This phone has stopped playing. Carry on with the other device.',
    actionLabel: 'Back to start',
    onAction: () => context.go('/player'),
  );
}
