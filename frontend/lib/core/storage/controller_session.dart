import 'session_store.dart';

const _kToken = 'controllerToken';
const _kUser = 'controllerUsername';

/// The Controller's sign-in, kept for this browser tab only (FE-11).
void saveControllerSession(String token, String username) {
  sessionWrite(_kToken, token);
  sessionWrite(_kUser, username);
}

(String token, String username)? loadControllerSession() {
  final token = sessionRead(_kToken);
  final user = sessionRead(_kUser);
  if (token == null || token.isEmpty) return null;
  return (token, user ?? '');
}

void forgetControllerSession() {
  sessionRemove(_kToken);
  sessionRemove(_kUser);
}
