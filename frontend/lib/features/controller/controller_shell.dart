import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:material_ui/material_ui.dart';

import '../../core/theme/heist_theme.dart';
import 'controller_auth.dart';
import 'controller_dashboard.dart';
import 'controller_login.dart';

/// Entry point of the `/controller` route: the restricted booth dashboard.
/// Loaded with a deferred import.
///
/// The guard (FE-11): nothing but the login card shows until the Controller
/// is signed in. Any 401 or `controller:kicked` drops back here.
class ControllerShell extends ConsumerWidget {
  const ControllerShell({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final auth = ref.watch(controllerAuthProvider);
    final Widget page;
    if (auth.reason == SignOutReason.signedInElsewhere) {
      page = const SignedInElsewhere();
    } else if (!auth.signedIn) {
      page = const ControllerLogin();
    } else {
      page = const ControllerDashboard();
    }
    return HeistThemeScope(child: Title(title: 'Prompt Heist Controller', color: HeistColors.blue, child: page));
  }
}
