import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:prompt_heist/core/api/api_client.dart';
import 'package:prompt_heist/core/api/token_store.dart';
import 'package:prompt_heist/core/mock/mock_backend.dart';
import 'package:prompt_heist/core/realtime/socket_providers.dart';
import 'package:prompt_heist/features/player/battle/game_state.dart';

/// A fake player backend. [prompts] is what `GET /me` returns; [submit]
/// answers `POST /prompts` and may wait on a completer.
class _FakeBackend {
  List<Map<String, dynamic>> prompts = [];
  Future<(int, Map<String, dynamic>)> Function(String key, String text)? submit;

  Map<String, dynamic> me() => {
    'serverNow': DateTime.now().toUtc().toIso8601String(),
    'player': {'slotNumber': 1, 'state': 'PLAYING', 'bestScore': null},
    'session': {'phase': 'PLAYING'},
    'treasure': {
      'title': 'T',
      'backstory': 'B',
      'lockObjective': 'L',
      'imageUrl': '',
    },
    'round': {
      'roundId': 'rnd_1',
      'roundNumber': 1,
      'durationSeconds': 90,
      'roundEndAt': DateTime.now()
          .toUtc()
          .add(const Duration(seconds: 60))
          .toIso8601String(),
    },
    'canSubmit': true,
    'prompts': prompts,
  };

  Dio dio() {
    final dio = Dio();
    dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (o, h) async {
          Response<dynamic> res(int status, Object data) =>
              Response(requestOptions: o, statusCode: status, data: data);
          if (o.path == '/api/player/me') return h.resolve(res(200, me()));
          if (o.path == '/api/player/prompts' && o.method == 'POST') {
            final key = '${o.headers['Idempotency-Key']}';
            final (status, body) = await submit!(
              key,
              '${(o.data as Map)['text']}',
            );
            if (status >= 400) {
              return h.reject(
                DioException(
                  requestOptions: o,
                  type: DioExceptionType.badResponse,
                  response: res(status, body),
                ),
              );
            }
            return h.resolve(res(status, body));
          }
          h.reject(DioException(requestOptions: o));
        },
      ),
    );
    return dio;
  }
}

Map<String, dynamic> _err(String code) => {
  'error': {'code': code, 'message': code},
};

void main() {
  late _FakeBackend backend;
  late ProviderContainer c;

  /// Waits for [done], so the tests do not depend on timing.
  Future<void> until(bool Function() done) async {
    for (var i = 0; i < 300 && !done(); i++) {
      await Future<void>.delayed(const Duration(milliseconds: 10));
    }
    expect(done(), isTrue, reason: 'timed out waiting');
  }

  setUp(() async {
    backend = _FakeBackend();
    c = ProviderContainer(
      overrides: [dioProvider.overrideWithValue(backend.dio())],
    );
    c.read(tokenProvider.notifier).set('ply_token');
    c.listen(gameProvider, (_, _) {});
    await until(() => c.read(gameProvider).canSubmit);
  });

  tearDown(() => c.dispose());

  GameNotifier game() => c.read(gameProvider.notifier);
  List<PromptItem> items() => c.read(gameProvider).prompts;

  /// A socket event, delivered the way the mock /player socket relays it.
  Future<void> emit(String event, Map<String, dynamic> data) async {
    c.read(mockBackendProvider).world.events.add((event, data));
    // Events pass through two async streams; a zero timer runs after both.
    await Future<void>.delayed(Duration.zero);
  }

  group('Retry only when it can succeed (review bug 7)', () {
    test('time up, locked and too long cannot be retried', () async {
      for (final code in [
        'ROUND_EXPIRED',
        'PLAYER_LOCKED',
        'PROMPT_TOO_LONG',
      ]) {
        backend.submit = (_, _) async => (409, _err(code));
        await game().submit('a prompt for $code');
      }
      expect(items().map((p) => p.stage), everyElement(PromptStage.failed));
      expect(items().map((p) => p.canRetry), everyElement(isFalse));
    });

    test('a server error or lost connection can be retried', () async {
      backend.submit = (_, _) async => (503, _err('UNAVAILABLE'));
      await game().submit('one');
      expect(items().single.canRetry, isTrue);
    });

    test('prompt:failed follows canRetry from the server', () async {
      backend.submit = (key, _) async =>
          (202, {'promptId': 'prm_$key', 'status': 'RECEIVED'});
      await game().submit('one');
      final id = items().single.promptId!;
      await emit('prompt:failed', {
        'promptId': id,
        'message': 'No.',
        'canRetry': false,
      });
      expect(items().single.stage, PromptStage.failed);
      expect(items().single.canRetry, isFalse);
    });
  });

  test(
    'a score that arrives before the submit reply is kept (review bug 8)',
    () async {
      final reply = Completer<(int, Map<String, dynamic>)>();
      backend.submit = (_, _) => reply.future;
      final sending = game().submit('fast score');
      await until(() => items().length == 1);

      await emit('prompt:scored', {
        'promptId': 'prm_9',
        'score': 72,
        'feedback': 'Nice.',
        'bestScore': 72,
      });
      expect(items().single.stage, PromptStage.submitting);

      reply.complete((202, {'promptId': 'prm_9', 'status': 'RECEIVED'}));
      await sending;
      expect(items().single.stage, PromptStage.scored);
      expect(items().single.score, 72);
      expect(c.read(gameProvider).bestScore, 72);
    },
  );

  test('a reload matches prompts by id, not by text (review bug 9)', () async {
    final replies = <String, Completer<(int, Map<String, dynamic>)>>{};
    final keys = <String>[];
    backend.submit = (key, _) {
      keys.add(key);
      return (replies[key] = Completer()).future;
    };
    // The same text, sent twice; neither reply has come back yet.
    final first = game().submit('same text');
    final second = game().submit('same text');
    await until(() => keys.length == 2);

    // A reload: the server has scored only the SECOND one so far.
    backend.prompts = [
      {
        'promptId': 'prm_2',
        'text': 'same text',
        'status': 'SCORED',
        'score': 90,
        'feedback': 'Close!',
        'receivedAt': DateTime.now().toUtc().toIso8601String(),
      },
    ];
    c.invalidate(meProvider);
    await until(() => items().length == 3);
    expect(
      items().where((p) => p.promptId == null),
      hasLength(2),
      reason: 'no local card was guessed from its text',
    );

    replies[keys[1]]!.complete((
      200,
      {'promptId': 'prm_2', 'status': 'SCORED'},
    ));
    replies[keys[0]]!.complete((
      202,
      {'promptId': 'prm_1', 'status': 'RECEIVED'},
    ));
    await Future.wait([first, second]);

    expect(items(), hasLength(2));
    final byKey = {for (final p in items()) p.key: p};
    expect(byKey[keys[0]]!.promptId, 'prm_1');
    expect(byKey[keys[0]]!.stage, PromptStage.evaluating);
    expect(byKey[keys[1]]!.promptId, 'prm_2');
    expect(byKey[keys[1]]!.score, 90);
  });
}
