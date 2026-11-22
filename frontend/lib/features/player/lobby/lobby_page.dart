import 'package:material_ui/material_ui.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../app/env.dart';
import '../../../core/api/api_error.dart';
import '../../../core/api/token_store.dart';
import '../../../core/realtime/socket_providers.dart';
import '../../../core/storage/player_session.dart';
import '../../../core/widgets/widgets.dart';
import '../widgets/player_ui.dart';
import 'lobby_state.dart';

class LobbyPage extends ConsumerStatefulWidget {
  const LobbyPage({super.key});

  @override
  ConsumerState<LobbyPage> createState() => _LobbyPageState();
}

class _LobbyPageState extends ConsumerState<LobbyPage> {
  bool _left = false; // we are already navigating away
  bool _scripted = false; // mock demo started

  void _leave(String path, {bool forget = true}) {
    if (_left) return;
    _left = true;
    if (forget) {
      forgetPlayerToken();
      ref.read(tokenProvider.notifier).set(null);
    }
    context.go(path);
  }

  @override
  Widget build(BuildContext context) {
    // Dead sessions: SESSION_CLOSED clears the phone, TOKEN_SUPERSEDED = kicked.
    ref.listen(meProvider, (prev, next) {
      final e = next.error;
      if (e is ApiException) {
        if (e.code == 'SESSION_CLOSED') _leave('/player');
        if (e.code == 'TOKEN_SUPERSEDED') _leave('/player/kicked');
      }
    });

    final lobby = ref.watch(lobbyProvider);

    // round:started moves to the battle with no button.
    if (lobby.roundStarted && !_left) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) _leave('/player/battle', forget: false);
      });
    }

    // Mock only: play a lobby filling up, then the round starting.
    if (lobby.ready &&
        !lobby.roundStarted &&
        !_scripted &&
        Env.isMock) {
      _scripted = true;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) {
          ref
              .read(playerSocketProvider)
              .mockLobbyScript(myLabel: lobby.myLabel ?? 'You');
        }
      });
    }

    if (!lobby.ready) {
      final failed = ref.watch(meProvider).hasError;
      return PlayerLoading(
        message: failed ? 'Cannot reach the server.' : null,
        onRetry: failed ? () => ref.invalidate(meProvider) : null,
      );
    }

    final c = context.hc;
    final shape = slotShapeOf(lobby.myShape);
    final first = (lobby.myLabel ?? '').split(' ').first;
    return PlayerPage(
      header: HeroBanner(
        color: heroGreen,
        child: Column(
          spacing: 6,
          children: [
            const Text(
              "You're in!",
              style: TextStyle(fontSize: 30, fontWeight: FontWeight.w500),
            ),
            Text(
              first.isEmpty
                  ? 'Waiting for players'
                  : 'Look for $first on the big screen',
              textAlign: TextAlign.center,
              style: const TextStyle(fontSize: 14),
            ),
          ],
        ),
      ),
      content: [
        const SizedBox(height: 4),
        Row(
          children: [
            Text(
              'Waiting for players',
              style: TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.w500,
                color: c.text,
              ),
            ),
            const Spacer(),
            Text(
              '${lobby.joinedCount}/${lobby.capacity} joined',
              key: const Key('joinedCount'),
              style: context.mono(TextStyle(color: c.textSecondary)),
            ),
          ],
        ),
        _Segments(joined: lobby.joinedCount, total: lobby.capacity),
        if (lobby.revealed)
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              for (final p in lobby.players)
                PlayerPill(
                  shape: slotShapeOf(p.shape),
                  label: p.label,
                  isMe: p.slotNumber == lobby.mySlot,
                  dimmed: p.connection == 'DISCONNECTED',
                ),
            ],
          )
        else
          const InfoCard(
            child: IconLine(
              Icons.groups_outlined,
              'Names appear when everyone has joined.',
            ),
          ),
      ],
      bottom: [
        Row(
          mainAxisAlignment: MainAxisAlignment.center,
          spacing: 8,
          children: [
            ShapeAvatar(shape, size: 18),
            Flexible(
              child: Text.rich(
                TextSpan(
                  children: [
                    const TextSpan(text: 'Your shape: '),
                    TextSpan(
                      text: shape.description,
                      style: TextStyle(
                        fontWeight: FontWeight.w500,
                        color: shape.tone.colors(c).$2,
                      ),
                    ),
                  ],
                ),
                style: TextStyle(color: c.textSecondary),
              ),
            ),
          ],
        ),
        Text(
          'The game starts by itself. Keep this screen open.',
          textAlign: TextAlign.center,
          style: TextStyle(fontSize: 12, color: c.textMuted),
        ),
      ],
    );
  }
}

/// One bar per slot, filled in that slot's colour as players join.
class _Segments extends StatelessWidget {
  const _Segments({required this.joined, required this.total});
  final int joined;
  final int total;

  @override
  Widget build(BuildContext context) => Row(
    spacing: 4,
    children: [
      for (var i = 0; i < total; i++)
        Expanded(
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 300),
            height: 8,
            decoration: BoxDecoration(
              color: i < joined
                  ? SlotShape.forSlot(i + 1).color
                  : context.hc.border,
              borderRadius: BorderRadius.circular(999),
            ),
          ),
        ),
    ],
  );
}
