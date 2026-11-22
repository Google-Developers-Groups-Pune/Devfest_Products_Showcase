import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:material_ui/material_ui.dart';

import '../core/theme/heist_theme.dart';
import 'router.dart';

class PromptHeistApp extends ConsumerWidget {
  const PromptHeistApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return MaterialApp.router(
      title: 'Prompt Heist',
      debugShowCheckedModeBanner: false,
      theme: buildHeistTheme(),
      themeMode: ThemeMode.dark,
      routerConfig: ref.watch(routerProvider),
    );
  }
}
