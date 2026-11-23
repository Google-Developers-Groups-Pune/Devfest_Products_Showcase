import 'dart:async';

import '../realtime/game_socket.dart';
import 'mock_controller.dart';
import 'mock_display.dart';
import 'mock_world.dart';

/// Mock flavour only: a [GameSocket] fed by the in-app mocks instead of a
/// server. Everything mock-only lives here, never in the real socket.
class MockGameSocket extends GameSocket {
  MockGameSocket({required super.namespace, required super.onHydrate, super.token}) : super.base();

  // Test a wrong phone clock with: --dart-define=MOCK_CLOCK_SKEW=120
  static const _skew = Duration(seconds: int.fromEnvironment('MOCK_CLOCK_SKEW', defaultValue: 0));

  Timer? _syncTimer;
  StreamSubscription<(String, Object?)>? _worldSub;
  final _scriptTimers = <Timer>[];
  DateTime? _freeRunEnd;

  @override
  void connect() {
    _syncTimer?.cancel();
    _worldSub?.cancel();
    if (namespace == '/display') {
      // The scripted audience show sends its own timer:sync.
      _worldSub = MockDisplay.events.stream.listen((e) => emit(e.$1, e.$2));
      Future<void>.delayed(Duration.zero, connected);
      return;
    }
    if (namespace == '/controller') {
      // The mock booth sends its own timer:sync while a round runs.
      MockController.startClock();
      _worldSub = MockController.events.stream.listen((e) => emit(e.$1, e.$2));
      Future<void>.delayed(Duration.zero, connected);
      return;
    }
    // Prompt events from the mock world arrive like real socket events.
    _worldSub = MockWorld.events.stream.listen((e) => emit(e.$1, e.$2));
    Future<void>.delayed(Duration.zero, connected);
    Future<void>.delayed(const Duration(milliseconds: 300), _sendSync);
    _syncTimer = Timer.periodic(const Duration(seconds: 3), (_) => _sendSync());
  }

  void _sendSync() {
    final now = DateTime.now().toUtc();
    var end = MockWorld.roundEnd;
    if (end == null) {
      // /dev screen only: a free-running 90 second round.
      if (_freeRunEnd == null || now.isAfter(_freeRunEnd!.add(const Duration(seconds: 5)))) {
        _freeRunEnd = now.add(const Duration(seconds: 90));
      }
      end = _freeRunEnd;
    }
    emit('timer:sync', {
      'roundId': 'rnd_1',
      'roundEndAt': end!.add(_skew).toIso8601String(),
      'serverNow': now.add(_skew).toIso8601String(),
    });
  }

  /// Plays a lobby filling up, names revealed, then the round starting.
  void mockLobbyScript({required String myLabel}) {
    for (final t in _scriptTimers) {
      t.cancel();
    }
    _scriptTimers.clear();

    void at(int sec, void Function() fn) => _scriptTimers.add(
      Timer(Duration(seconds: sec), () {
        if (!isDisposed) fn();
      }),
    );

    for (var n = 2; n <= 5; n++) {
      at((n - 1) * 2, () => emit('player:joined', {'joinedCount': n, 'capacity': 5}));
    }
    at(10, () {
      emit('players:revealed', {
        'players': [
          {'slotNumber': 1, 'label': myLabel, 'shape': 'BLUE_CIRCLE', 'connection': 'CONNECTED'},
          {'slotNumber': 2, 'label': 'Priya', 'shape': 'RED_SQUARE', 'connection': 'CONNECTED'},
          {'slotNumber': 3, 'label': 'Rohan', 'shape': 'YELLOW_DIAMOND', 'connection': 'CONNECTED'},
          {'slotNumber': 4, 'label': 'Meera', 'shape': 'GREEN_PILL', 'connection': 'CONNECTED'},
          {'slotNumber': 5, 'label': 'Isha', 'shape': 'GREEN_CIRCLE', 'connection': 'CONNECTED'},
        ],
      });
    });
    at(14, () {
      MockWorld.startRound();
      final now = DateTime.now().toUtc();
      emit('round:started', {
        'roundId': 'rnd_1',
        'roundNumber': 1,
        'durationSeconds': MockWorld.roundSeconds,
        'startedAt': now.add(_skew).toIso8601String(),
        'roundEndAt': MockWorld.roundEnd!.add(_skew).toIso8601String(),
        'serverNow': now.add(_skew).toIso8601String(),
        'treasure': MockWorld.treasure,
      });
    });
  }

  /// Pretends the server kicked this device.
  void mockKick() => emit('player:kicked', {'reason': 'REJOINED_ON_ANOTHER_DEVICE'});

  /// For the QE check: drops the connection and comes back after [d].
  void simulateOffline(Duration d) {
    setStatus(SocketStatus.reconnecting);
    _syncTimer?.cancel();
    // Events sent while offline are lost, as on a real network. The hydrate
    // call after reconnecting brings the screen back up to date.
    _worldSub?.cancel();
    Future<void>.delayed(d, () {
      if (!isDisposed) connect();
    });
  }

  @override
  void dispose() {
    _syncTimer?.cancel();
    _worldSub?.cancel();
    for (final t in _scriptTimers) {
      t.cancel();
    }
    super.dispose();
  }
}
