import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/storage/controller_session.dart';
import 'controller_api.dart';

/// Why the Controller is looking at the login card.
enum SignOutReason { none, signedOut, expired, signedInElsewhere }

class ControllerAuth {
  const ControllerAuth({this.token, this.username = '', this.reason = SignOutReason.none});

  final String? token;
  final String username;

  /// Set when the Controller was sent back to the login card.
  final SignOutReason reason;

  bool get signedIn => token != null;
}

/// Sign-in state for `/controller` (FE-11). The token lives in sessionStorage,
/// so a refresh keeps the Controller signed in until the tab closes.
class ControllerAuthNotifier extends Notifier<ControllerAuth> {
  @override
  ControllerAuth build() {
    final saved = loadControllerSession();
    if (saved == null) return const ControllerAuth();
    return ControllerAuth(token: saved.$1, username: saved.$2);
  }

  /// Throws an ApiException on bad credentials or too many tries.
  Future<void> login(String username, String password) async {
    final res = await ref.read(controllerApiProvider).login(username, password);
    final token = '${res['token']}';
    final name = '${(res['controller'] as Map?)?['username'] ?? username}';
    saveControllerSession(token, name);
    state = ControllerAuth(token: token, username: name);
  }

  Future<void> signOut() async {
    try {
      await ref.read(controllerApiProvider).logout();
    } catch (_) {
      // Signing out locally is enough; the token expires on its own.
    }
    _clear(SignOutReason.signedOut);
  }

  /// A 401 from any call: the token is gone or revoked.
  void expired() {
    if (state.signedIn) _clear(SignOutReason.expired);
  }

  /// `controller:kicked`: someone signed in with this account elsewhere.
  void kicked() {
    if (state.signedIn) _clear(SignOutReason.signedInElsewhere);
  }

  /// The "signed in elsewhere" message has been read.
  void acknowledge() => state = ControllerAuth(username: state.username);

  void _clear(SignOutReason reason) {
    forgetControllerSession();
    state = ControllerAuth(username: state.username, reason: reason);
  }
}

final controllerAuthProvider = NotifierProvider<ControllerAuthNotifier, ControllerAuth>(
  ControllerAuthNotifier.new,
);
