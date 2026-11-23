import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:prompt_heist/core/api/api_client.dart';
import 'package:prompt_heist/core/api/api_error.dart';
import 'package:prompt_heist/core/api/player_api.dart';
import 'package:prompt_heist/core/api/player_exit.dart';

/// A Dio whose every call fails with [status] and [code].
Dio _failing(int status, String code) {
  final dio = Dio();
  dio.interceptors.add(
    InterceptorsWrapper(
      onRequest: (options, handler) => handler.reject(
        DioException(
          requestOptions: options,
          type: DioExceptionType.badResponse,
          response: Response(
            requestOptions: options,
            statusCode: status,
            data: {
              'error': {'code': code, 'message': code},
            },
          ),
        ),
      ),
    ),
  );
  return dio;
}

void main() {
  Future<PlayerExit?> exitAfter(
    int status,
    String code,
    Future<void> Function(PlayerApi) call,
  ) async {
    final c = ProviderContainer(
      overrides: [dioProvider.overrideWithValue(_failing(status, code))],
    );
    addTearDown(c.dispose);
    await expectLater(
      call(c.read(playerApiProvider)),
      throwsA(isA<ApiException>()),
    );
    return c.read(playerExitProvider);
  }

  test(
    'SESSION_CLOSED and UNAUTHENTICATED clear the phone from any call',
    () async {
      expect(
        await exitAfter(401, 'SESSION_CLOSED', (a) => a.me()),
        PlayerExit.cleared,
      );
      expect(
        await exitAfter(401, 'UNAUTHENTICATED', (a) => a.result()),
        PlayerExit.cleared,
      );
      expect(
        await exitAfter(401, 'SESSION_CLOSED', (a) => a.prompt('prm_1')),
        PlayerExit.cleared,
      );
    },
  );

  test('TOKEN_SUPERSEDED shows the kicked screen', () async {
    expect(
      await exitAfter(
        401,
        'TOKEN_SUPERSEDED',
        (a) => a.submitPrompt('hi', 'k1'),
      ),
      PlayerExit.kicked,
    );
  });

  test('other errors and the join call do not end the session', () async {
    expect(
      await exitAfter(409, 'ROUND_EXPIRED', (a) => a.submitPrompt('hi', 'k1')),
      isNull,
    );
    expect(await exitAfter(500, 'INTERNAL', (a) => a.me()), isNull);
    // The join page handles its own join-token errors.
    expect(
      await exitAfter(
        401,
        'UNAUTHENTICATED',
        (a) => a.join(joinToken: 'j', fullName: 'A', entranceId: 'B'),
      ),
      isNull,
    );
  });
}
