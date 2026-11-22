import 'dart:async';

import 'package:material_ui/material_ui.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/api/token_store.dart';
import '../../../core/storage/player_session.dart';
import '../../../core/widgets/widgets.dart';

class CancelledPage extends ConsumerStatefulWidget {
  const CancelledPage({super.key});

  @override
  ConsumerState<CancelledPage> createState() => _CancelledPageState();
}

class _CancelledPageState extends ConsumerState<CancelledPage> {
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    // Clear this phone now, so a refresh also lands on the booth code screen.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      forgetPlayerToken();
      ref.read(tokenProvider.notifier).set(null);
    });
    _timer = Timer(const Duration(seconds: 4), () {
      if (mounted) context.go('/player');
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => MessageScreen(
    icon: Icons.cancel_outlined,
    tone: Tone.warning,
    title: 'This round was cancelled',
    message: 'Please go back to the booth. The team will help you.',
    actionLabel: 'Back to start',
    onAction: () => context.go('/player'),
  );
}
