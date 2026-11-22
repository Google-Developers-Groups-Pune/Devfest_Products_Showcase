import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/api_client.dart';
import '../../core/api/api_error.dart';
import 'controller_auth.dart';

typedef Json = Map<String, dynamic>;
Json _json(dynamic j) => j is Map ? Map<String, dynamic>.from(j) : <String, dynamic>{};

/// Every Controller endpoint from the shared contract.
///
/// The Controller token is sent explicitly on each call, so it never mixes
/// with a player token in the shared `tokenProvider`. Any 401 signs the
/// Controller out and sends them back to the login card (FE-11).
class ControllerApi {
  ControllerApi(this._dio, this._token, this._onUnauthorized);

  final Dio _dio;
  final String? Function() _token;
  final void Function() _onUnauthorized;

  Options _auth([Map<String, String> extra = const {}]) =>
      Options(headers: {if (_token() != null) 'Authorization': 'Bearer ${_token()}', ...extra});

  Future<T> _call<T>(Future<Response<dynamic>> Function() req, T Function(dynamic) parse) async {
    try {
      return await apiCall(req, parse);
    } on ApiException catch (e) {
      if (e.statusCode == 401) _onUnauthorized();
      rethrow;
    }
  }

  // API 1-3: auth
  Future<Json> login(String username, String password) => apiCall(
    () => _dio.post('/api/controller/auth/login', data: {'username': username, 'password': password}),
    _json,
  );
  Future<void> logout() => _call(() => _dio.post('/api/controller/auth/logout', options: _auth()), (_) {});
  Future<Json> me() => _call(() => _dio.get('/api/controller/auth/me', options: _auth()), _json);

  // API 4-6, 28, 29: sessions
  Future<Json> active() => _call(() => _dio.get('/api/controller/sessions/active', options: _auth()), _json);
  Future<Json> openSession(int capacity, int durationSeconds) => _call(
    () => _dio.post(
      '/api/controller/sessions',
      data: {'capacity': capacity, 'roundDurationSeconds': durationSeconds},
      options: _auth(),
    ),
    _json,
  );
  Future<Json> setDuration(String sessionId, int seconds) => _call(
    () => _dio.patch(
      '/api/controller/sessions/$sessionId/duration',
      data: {'roundDurationSeconds': seconds},
      options: _auth(),
    ),
    _json,
  );
  Future<Json> closeSession(String sessionId, {String? reason}) => _call(
    () => _dio.post(
      '/api/controller/sessions/$sessionId/close',
      data: {'reason': ?reason},
      options: _auth(),
    ),
    _json,
  );
  Future<Json> nextGroup(String sessionId, String idempotencyKey) => _call(
    () => _dio.post(
      '/api/controller/sessions/$sessionId/next-group',
      options: _auth({'Idempotency-Key': idempotencyKey}),
    ),
    _json,
  );

  // API 7-10: treasure and start
  Future<Json> generateTreasure(String sessionId) =>
      _call(() => _dio.post('/api/controller/sessions/$sessionId/treasure', options: _auth()), _json);
  Future<Json> approveTreasure(String candidateId) =>
      _call(() => _dio.post('/api/controller/treasure/$candidateId/approve', options: _auth()), _json);
  Future<Json> rejectTreasure(String candidateId) =>
      _call(() => _dio.post('/api/controller/treasure/$candidateId/reject', options: _auth()), _json);
  Future<Json> start(String sessionId) =>
      _call(() => _dio.post('/api/controller/sessions/$sessionId/start', options: _auth()), _json);

  // API 30: name review
  Future<Json> approveName(String playerId) => _call(
    () => _dio.post(
      '/api/controller/players/$playerId/name-review',
      data: {'decision': 'APPROVED'},
      options: _auth(),
    ),
    _json,
  );
  Future<Json> renamePlayer(String playerId, String fullName) => _call(
    () => _dio.post(
      '/api/controller/players/$playerId/name-review',
      data: {'decision': 'RENAMED', 'fullName': fullName},
      options: _auth(),
    ),
    _json,
  );

  // API 11-14: round
  Future<Json> monitor(String roundId) =>
      _call(() => _dio.get('/api/controller/rounds/$roundId/monitor', options: _auth()), _json);
  Future<Json> result(String roundId) =>
      _call(() => _dio.get('/api/controller/rounds/$roundId/result', options: _auth()), _json);
  Future<Json> confirm(String roundId) =>
      _call(() => _dio.post('/api/controller/rounds/$roundId/confirm', options: _auth()), _json);
  Future<Json> discard(String roundId, String reason) => _call(
    () => _dio.post('/api/controller/rounds/$roundId/discard', data: {'reason': reason}, options: _auth()),
    _json,
  );

  // API 15-19: event day, health, audit
  Future<String> exportWinners() => _call(
    () => _dio.get(
      '/api/controller/winners/export',
      options: _auth().copyWith(responseType: ResponseType.plain),
    ),
    (d) => '$d',
  );
  Future<Json> closeEvent() => _call(
    () => _dio.post('/api/controller/event/close', data: {'confirmation': 'CLOSE EVENT'}, options: _auth()),
    _json,
  );
  Future<Json> eventStatus() => _call(() => _dio.get('/api/controller/event/status', options: _auth()), _json);
  Future<Json> agentHealth() => _call(() => _dio.get('/api/controller/health/agents', options: _auth()), _json);
  Future<Json> auditLogs({int limit = 50, String? cursor}) => _call(
    () => _dio.get(
      '/api/controller/audit-logs',
      queryParameters: {'limit': limit, 'cursor': ?cursor},
      options: _auth(),
    ),
    _json,
  );
}

final controllerApiProvider = Provider<ControllerApi>((ref) {
  return ControllerApi(
    ref.watch(dioProvider),
    () => ref.read(controllerAuthProvider).token,
    () => ref.read(controllerAuthProvider.notifier).expired(),
  );
});

/// Clear words for the error codes the Controller can hit (FE-14 and others).
String controllerErrorText(Object e) {
  if (e is! ApiException) return 'Something went wrong. Try again.';
  return switch (e.code) {
    'PLAYERS_NOT_READY' => 'A player is missing or disconnected. Wait for every phone to reconnect.',
    'NAMES_NOT_REVIEWED' => 'Review every player name before starting.',
    'TREASURE_NOT_APPROVED' => 'Approve a treasure before starting.',
    'AGENTS_UNAVAILABLE' => 'An AI agent is down, so the round cannot start. Check agent health and try again.',
    'INVALID_PHASE' => 'The session has moved on. The screen has been refreshed.',
    'SESSION_ALREADY_ACTIVE' => 'A session is already open. The screen has been refreshed.',
    'EVENT_CLOSED' => 'The event day is closed.',
    'EVENT_CLOSING_FAILED' => 'Closing the event day failed. Retry the deletion before doing anything else.',
    'PLAYERS_NOT_JOINED' => 'Wait until every player has joined.',
    'GENERATION_IN_PROGRESS' => 'A treasure is already being generated.',
    'CANDIDATE_NOT_READY' => 'The treasure is not ready yet. Wait for the image.',
    'RESULT_NOT_READY' => 'The result is still being calculated.',
    'NO_WINNER' => 'Nobody scored, so there is no winner to confirm. Discard the round instead.',
    'REASON_REQUIRED' => 'Give a reason.',
    'NAME_REQUIRED' => 'Type the replacement name.',
    'CSV_NOT_EXPORTED' => 'Export a winners CSV that covers every winner before closing the day.',
    'CONFIRMATION_REQUIRED' => 'Type CLOSE EVENT to confirm.',
    'VALIDATION_FAILED' => 'Check the values and try again.',
    'NOT_FOUND' => 'That item no longer exists. The screen has been refreshed.',
    'NETWORK_ERROR' => 'Cannot reach the server. Check the connection and try again.',
    _ => e.message,
  };
}
