import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'api_client.dart';
import 'api_error.dart';
import 'player_exit.dart';
import '../json.dart';
export '../json.dart';

Json _json(dynamic j) => Map<String, dynamic>.from(j as Map);

class PlayerApi {
  PlayerApi(this._dio, this._onUnauthorized);
  final Dio _dio;

  /// Gets the code of every 401 from a call made with the player token, so
  /// a closed session or a lost token is handled once, on any screen (FE-07).
  final void Function(String code) _onUnauthorized;

  Future<Json> _playerCall(Future<Response<dynamic>> Function() request) async {
    try {
      return await apiCall(request, _json);
    } on ApiException catch (e) {
      if (e.statusCode == 401) _onUnauthorized(e.code);
      rethrow;
    }
  }

  Future<Json> joinCode(String code) => apiCall(
    () => _dio.post('/api/player/join/code', data: {'code': code}),
    _json,
  );

  Future<Json> join({
    required String joinToken,
    required String fullName,
    required String entranceId,
  }) => apiCall(
    () => _dio.post(
      '/api/player/join',
      data: {'fullName': fullName, 'entranceId': entranceId},
      options: Options(headers: {'Authorization': 'Bearer $joinToken'}),
    ),
    _json,
  );

  Future<Json> rejoin(String entranceId) => apiCall(
    () => _dio.post('/api/player/rejoin', data: {'entranceId': entranceId}),
    _json,
  );

  Future<Json> me() => _playerCall(() => _dio.get('/api/player/me'));

  Future<Json> submitPrompt(String text, String idempotencyKey) => _playerCall(
    () => _dio.post(
      '/api/player/prompts',
      data: {'text': text},
      options: Options(headers: {'Idempotency-Key': idempotencyKey}),
    ),
  );

  Future<Json> prompt(String id) =>
      _playerCall(() => _dio.get('/api/player/prompts/$id'));

  Future<Json> result() => _playerCall(() => _dio.get('/api/player/result'));
}

class DisplayApi {
  DisplayApi(this._dio);
  final Dio _dio;
  Future<Json> state() => apiCall(() => _dio.get('/api/display/state'), _json);
}

final playerApiProvider = Provider(
  (ref) => PlayerApi(
    ref.watch(dioProvider),
    (code) => ref.read(playerExitProvider.notifier).report(code),
  ),
);
final displayApiProvider = Provider(
  (ref) => DisplayApi(ref.watch(dioProvider)),
);
