/// Build-time configuration, passed with `--dart-define-from-file=config/<flavour>.json`.
///
/// Flavours (FE-01): `config/mock.json` targets the BE-02 mock server,
/// `config/local.json` targets a locally running backend.
abstract final class Env {
  /// Backend `mock` or `real`.
  static const String backend = String.fromEnvironment('BACKEND', defaultValue: 'mock');

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
