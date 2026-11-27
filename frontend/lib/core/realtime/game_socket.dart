import 'dart:async';

import 'package:socket_io_client/socket_io_client.dart' as io;

import '../../app/env.dart';
import '../mock/mock_backend.dart';
import '../mock/mock_socket.dart';

enum SocketStatus { connecting, connected, reconnecting }

class SocketMessage {
  SocketMessage(this.event, this.data);
  final String event;
  final dynamic data;
}

/// One connection to one namespace (/player, /display, /controller).
/// After EVERY connect or reconnect, [onHydrate] runs so the app reloads
/// its state over REST. Sockets only receive; all writes go through REST.
///
/// [mock] is the in-app backend, passed only in the mock flavour.
///
/// The app only sees this interface. [RealGameSocket] talks Socket.IO; the
/// mock flavour gets a [MockGameSocket], which keeps every mock-only member
/// out of the real code. `Env.isMock` is a constant, so a real build drops
/// the mock entirely.
abstract class GameSocket {
  factory GameSocket({
    required String namespace,
    required Future<void> Function() onHydrate,
    String? token,
    MockBackend? mock,
  }) => Env.isMock
      ? MockGameSocket(mock: mock!, namespace: namespace, onHydrate: onHydrate, token: token)
      : RealGameSocket(namespace: namespace, onHydrate: onHydrate, token: token);

  /// For subclasses.
  GameSocket.base({required this.namespace, required this.onHydrate, this.token});

  final String namespace;
  final String? token;
  final Future<void> Function() onHydrate;

  bool _disposed = false;
  SocketStatus _current = SocketStatus.connecting;

  final _messages = StreamController<SocketMessage>.broadcast();
  final _status = StreamController<SocketStatus>.broadcast();
  final _refused = StreamController<String>.broadcast();

  /// Codes the server sends in `connect_error` when it refuses the handshake.
  /// Retrying cannot help, so the socket stops and reports the code.
  static const refusalCodes = {'UNAUTHENTICATED', 'SESSION_CLOSED', 'TOKEN_SUPERSEDED'};

  Stream<SocketMessage> get messages => _messages.stream;

  /// One of [refusalCodes], after which the socket no longer reconnects.
  Stream<String> get refused => _refused.stream;
  Stream<SocketStatus> get status => _status.stream;
  SocketStatus get currentStatus => _current;
  bool get isDisposed => _disposed;

  void connect();

  /// For subclasses: the connection is up, so reload over REST.
  Future<void> connected() async {
    if (_disposed) return;
    setStatus(SocketStatus.connected);
    try {
      await onHydrate();
    } catch (_) {
      /* the screen shows its own error state */
    }
  }

  /// For subclasses: delivers one server event.
  void emit(String event, dynamic data) {
    if (!_disposed) _messages.add(SocketMessage(event, data));
  }

  /// For subclasses.
  void setStatus(SocketStatus v) {
    if (_disposed) return;
    _current = v;
    _status.add(v);
  }

  /// For subclasses: the server refused the handshake with [code].
  void refuse(String code) {
    if (!_refused.isClosed) _refused.add(code);
  }

  void dispose() {
    _disposed = true;
    _messages.close();
    _status.close();
    _refused.close();
  }
}

/// The Socket.IO connection to the backend.
class RealGameSocket extends GameSocket {
  RealGameSocket({required super.namespace, required super.onHydrate, super.token}) : super.base();

  io.Socket? _socket;

  @override
  void connect() {
    final opts = io.OptionBuilder()
        .setTransports(['websocket'])
        .disableAutoConnect()
        .enableReconnection()
        .setReconnectionDelay(1000)
        .setReconnectionDelayMax(5000)
        .setReconnectionAttempts(1 << 30)
        .setAuth(token == null ? {} : {'token': token})
        .build();

    final s = io.io('${Env.socketUrl}$namespace', opts);
    _socket = s;
    s.onConnect((_) => connected());
    s.onDisconnect((_) => setStatus(SocketStatus.reconnecting));
    s.onConnectError((err) {
      final code = err is Map ? '${err['message']}' : '$err';
      if (GameSocket.refusalCodes.contains(code)) {
        s.dispose();
        refuse(code);
        return;
      }
      setStatus(SocketStatus.reconnecting);
    });
    s.onAny((event, data) => emit(event, data));
    s.connect();
  }

  @override
  void dispose() {
    _socket?.dispose();
    super.dispose();
  }
}
