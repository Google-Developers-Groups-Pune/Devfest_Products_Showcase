import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:material_ui/material_ui.dart';

import 'router.dart';

class PromptHeistApp extends ConsumerWidget {
  const PromptHeistApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // Theme (Google logo palette, dark background) comes from FE-26.
    return MaterialApp.router(
      title: 'Prompt Heist',
      debugShowCheckedModeBanner: false,
      routerConfig: ref.watch(routerProvider),
    );
  }
}
