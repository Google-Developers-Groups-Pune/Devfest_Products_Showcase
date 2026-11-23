/// Build-time configuration, passed with `--dart-define-from-file=config/<flavour>.json`.
///
/// Flavours (FE-01): `config/mock.json` runs the in-app mock (no server),
/// `config/local.json` targets a locally running backend. With no file the
/// app talks to the real API at `localhost:4010`, which is where the BE-02
/// replay server (`npm run mock:game`) listens. The in-app mock is never on
/// unless a flavour asks for it.
abstract final class Env {
  /// Backend `mock` (in-app mock) or `real`.
  static const String backend = String.fromEnvironment('BACKEND', defaultValue: 'real');

  /// REST API base URL.
  static const String apiBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'http://localhost:4010',
  );

  /// Socket.IO host. The contract puts sockets on the API host, so this
  /// defaults to [apiBaseUrl]; the mock flavour may point it elsewhere.
  static const String socketUrl = String.fromEnvironment('SOCKET_URL', defaultValue: apiBaseUrl);

  static bool get isMock => backend == 'mock';
}
