import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_web_plugins/url_strategy.dart';
import 'package:material_ui/material_ui.dart';

import 'app/app.dart';

void main() {
  // Path URLs (/player), not hash URLs (/#/player). FE-01.
  usePathUrlStrategy();
  runApp(const ProviderScope(child: PromptHeistApp()));
}
