import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'mock_controller.dart';
import 'mock_display.dart';
import 'mock_world.dart';

/// Mock flavour only: the in-app backend. One instance per app (and per
/// test), owned by Riverpod, so no mock state lives in global variables.
class MockBackend {
  /// The player flow (FE-05 to FE-10).
  final world = MockWorld();

  /// The booth behind /controller.
  final controller = MockController();

  /// The scripted show on /audience.
  final display = MockDisplay();

  void dispose() {
    world.dispose();
    controller.dispose();
    display.dispose();
  }
}

/// Read only when `Env.isMock`, so a real build never creates the mock.
final mockBackendProvider = Provider<MockBackend>((ref) {
  final backend = MockBackend();
  ref.onDispose(backend.dispose);
  return backend;
});
