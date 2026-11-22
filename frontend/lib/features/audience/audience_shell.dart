import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:material_ui/material_ui.dart';

import '../../app/env.dart';
import '../../core/realtime/socket_providers.dart';
import '../../core/widgets/shape_marker.dart';
import 'audience_battle.dart';
import 'audience_state.dart';
import 'audience_style.dart';

/// Entry point of the `/audience` route: the public big screen ("display" in
/// the API). No login. Loaded with a deferred import.
///
/// The screen looks after itself (FE-19): it hydrates from
/// `GET /api/display/state`, listens on the `/display` socket, rehydrates after
/// every reconnect, and picks its screen from `phase` alone.
class AudienceShell extends ConsumerWidget {
  const AudienceShell({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final a = ref.watch(audienceProvider);
    final stage = Scaffold(
      backgroundColor: Stage.background,
      body: SizedBox.expand(
        // A fixed 1920x1080 stage scaled to any screen: 1080p, 4K, no scroll.
        child: FittedBox(
          fit: BoxFit.contain,
          child: SizedBox(
            width: Stage.width,
            height: Stage.height,
            child: DefaultTextStyle(
              style: const TextStyle(color: Stage.text),
              child: Stack(
                children: [
                  Positioned.fill(
                    top: 10,
                    child: AnimatedSwitcher(
                      duration: const Duration(milliseconds: 400),
                      child: KeyedSubtree(
                        key: ValueKey(screenFor(a.phase)),
                        child: _screen(a),
                      ),
                    ),
                  ),
                  const Positioned(
                    top: 0,
                    left: 0,
                    right: 0,
                    child: GoogleStripe(),
                  ),
                  if (!a.connected)
                    const Positioned(top: 30, right: 40, child: _Reconnecting()),
                ],
              ),
            ),
          ),
        ),
      ),
    );

    if (!Env.isMock) return stage;
    // Mock only: press O to drop the connection for 10 seconds (QE check).
    return CallbackShortcuts(
      bindings: {
        const SingleActivator(LogicalKeyboardKey.keyO): () => ref
            .read(displaySocketProvider)
            .simulateOffline(const Duration(seconds: 10)),
      },
      child: Focus(autofocus: true, child: stage),
    );
  }

  Widget _screen(AudienceState a) {
    if (!a.ready) {
      return const Center(child: CircularProgressIndicator(color: Stage.blue));
    }
    return switch (screenFor(a.phase)) {
      AudienceScreen.idle => const _IdleScreen(),
      AudienceScreen.joining => _JoiningScreen(a),
      AudienceScreen.getReady => _GetReadyScreen(a),
      AudienceScreen.battle => AudienceBattle(state: a),
      AudienceScreen.results => _ResultsPlaceholder(a),
    };
  }
}

enum AudienceScreen { idle, joining, getReady, battle, results }

/// The router: driven only by the session phase.
AudienceScreen screenFor(String phase) => switch (phase) {
  'JOINING' => AudienceScreen.joining,
  'TREASURE_REVIEW' || 'READY' => AudienceScreen.getReady,
  'PLAYING' => AudienceScreen.battle,
  'RESULT_PENDING' || 'RESULTS' => AudienceScreen.results,
  // SETUP (no session open), DISCARDED, CLOSED. The discard reason is never
  // shown on the public screen.
  _ => AudienceScreen.idle,
};

class _Reconnecting extends StatelessWidget {
  const _Reconnecting();

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 10),
    decoration: BoxDecoration(
      color: Stage.tint(Stage.yellow),
      borderRadius: BorderRadius.circular(30),
      border: Border.all(color: Stage.yellow, width: 2),
    ),
    child: const Text(
      'Reconnecting…',
      style: TextStyle(fontSize: 28, color: Stage.yellow),
    ),
  );
}

class _Dots extends StatelessWidget {
  const _Dots({this.size = 28});
  final double size;

  @override
  Widget build(BuildContext context) => Row(
    mainAxisSize: MainAxisSize.min,
    children: [
      for (final c in Stage.googleColors)
        Container(
          width: size,
          height: size,
          margin: EdgeInsets.symmetric(horizontal: size * 0.3),
          decoration: BoxDecoration(color: c, shape: BoxShape.circle),
        ),
    ],
  );
}

/// A player pill: marker and label, tinted in the slot colour.
class _PlayerPill extends StatelessWidget {
  const _PlayerPill(this.p, {this.check = false, this.wide = false});
  final AudiencePlayer p;
  final bool check;
  final bool wide;

  @override
  Widget build(BuildContext context) {
    final c = (shapeInfo[p.shape] ?? shapeInfo['BLUE_CIRCLE']!).color;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 28, vertical: 16),
      decoration: BoxDecoration(
        color: Stage.tint(c),
        borderRadius: BorderRadius.circular(60),
      ),
      child: Row(
        mainAxisSize: wide ? MainAxisSize.max : MainAxisSize.min,
        children: [
          ShapeMarker(p.shape, size: 40),
          const SizedBox(width: 20),
          // Labels are short and never cut off: "(Player 5)" must stay.
          wide
              ? Expanded(child: _label(c))
              : _label(c),
          if (check) ...[
            const SizedBox(width: 16),
            Icon(Icons.check_circle, size: 40, color: Stage.light(c)),
          ],
        ],
      ),
    );
  }

  Widget _label(Color c) => FittedBox(
    fit: BoxFit.scaleDown,
    alignment: Alignment.centerLeft,
    child: Text(p.label, style: TextStyle(fontSize: 40, color: Stage.light(c))),
  );
}

// ================= IDLE (no session open) =================

class _IdleScreen extends StatelessWidget {
  const _IdleScreen();

  @override
  Widget build(BuildContext context) => const Center(
    child: Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        _Dots(size: 44),
        SizedBox(height: 56),
        Text(
          'Prompt Heist',
          style: TextStyle(fontSize: 180, fontWeight: FontWeight.w600, height: 1),
        ),
        SizedBox(height: 32),
        Text(
          'Write the prompt that cracks the vault',
          style: TextStyle(fontSize: 52, color: Stage.muted),
        ),
        SizedBox(height: 80),
        Text(
          'The next battle opens soon. Come to the booth to play!',
          style: TextStyle(fontSize: 44, color: Stage.yellow),
        ),
      ],
    ),
  );
}

// ================= JOINING =================

class _JoiningScreen extends StatelessWidget {
  const _JoiningScreen(this.a);
  final AudienceState a;

  @override
  Widget build(BuildContext context) {
    final filled = a.joinedCount.clamp(0, a.capacity);
    return Padding(
      padding: const EdgeInsets.fromLTRB(110, 70, 110, 70),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Expanded(flex: 11, child: _JoinUrlPanel(a.joinUrl)),
          const SizedBox(width: 80),
          Expanded(
            flex: 8,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Row(
                  children: [
                    const Text('Players', style: TextStyle(fontSize: 64)),
                    const Spacer(),
                    Text(
                      '$filled / ${a.capacity}',
                      style: const TextStyle(
                        fontSize: 64,
                        fontFamily: 'AppMono',
                        color: Stage.muted,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 28),
                Row(
                  children: [
                    for (var i = 0; i < a.capacity; i++) ...[
                      if (i > 0) const SizedBox(width: 12),
                      Expanded(
                        child: AnimatedContainer(
                          duration: const Duration(milliseconds: 300),
                          height: 16,
                          decoration: BoxDecoration(
                            color: i < filled
                                ? Stage.googleColors[i % 4]
                                : Stage.border,
                            borderRadius: BorderRadius.circular(8),
                          ),
                        ),
                      ),
                    ],
                  ],
                ),
                const SizedBox(height: 40),
                // No names appear one by one (D16): the count only, then all
                // names together when players:revealed arrives.
                if (a.revealed)
                  for (final p in a.players) ...[
                    _PlayerPill(p, check: true, wide: true),
                    const SizedBox(height: 18),
                  ]
                else
                  Text(
                    filled >= a.capacity
                        ? 'Everyone is in! Names appear in a moment.'
                        : 'Names appear when everyone is in.',
                    style: const TextStyle(fontSize: 40, color: Stage.muted),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _JoinUrlPanel extends StatelessWidget {
  const _JoinUrlPanel(this.url);
  final String url;

  @override
  Widget build(BuildContext context) => Container(
    decoration: BoxDecoration(
      color: const Color(0xFF1A73E8),
      borderRadius: BorderRadius.circular(48),
    ),
    padding: const EdgeInsets.all(60),
    child: Column(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        const FittedBox(
          fit: BoxFit.scaleDown,
          child: Text(
            'Prompt Heist',
            style: TextStyle(
              fontSize: 150,
              fontWeight: FontWeight.w600,
              color: Colors.white,
            ),
          ),
        ),
        const SizedBox(height: 16),
        const Text(
          'Write the prompt that cracks the vault',
          style: TextStyle(fontSize: 44, color: Colors.white),
        ),
        const SizedBox(height: 70),
        if (url.isNotEmpty)
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 48, vertical: 24),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(60),
            ),
            child: FittedBox(
              fit: BoxFit.scaleDown,
              child: Text(
                url,
                style: const TextStyle(
                  fontFamily: 'AppMono',
                  fontSize: 60,
                  color: Color(0xFF1A73E8),
                ),
              ),
            ),
          ),
        const SizedBox(height: 36),
        const Text(
          'Open it on your phone and enter your booth code',
          style: TextStyle(fontSize: 38, color: Colors.white),
        ),
      ],
    ),
  );
}

// ================= GET READY =================

class _GetReadyScreen extends StatelessWidget {
  const _GetReadyScreen(this.a);
  final AudienceState a;

  @override
  Widget build(BuildContext context) => Center(
    child: Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        const _Dots(),
        const SizedBox(height: 40),
        const Text(
          'Get ready…',
          style: TextStyle(fontSize: 170, fontWeight: FontWeight.w500, height: 1),
        ),
        const SizedBox(height: 36),
        // Nothing from the treasure is shown until the round starts, so an
        // unapproved treasure can never reach this screen.
        Text(
          a.phase == 'READY'
              ? 'Today\'s treasure is locked in. The battle starts soon!'
              : 'The Controller is choosing today\'s treasure',
          style: const TextStyle(fontSize: 52, color: Stage.muted),
        ),
        const SizedBox(height: 80),
        Wrap(
          spacing: 24,
          runSpacing: 24,
          alignment: WrapAlignment.center,
          children: [for (final p in a.players) _PlayerPill(p)],
        ),
      ],
    ),
  );
}

// ================= RESULTS (FE-23) =================

/// Placeholder until FE-23 (Harsimar) adds the audience result screens.
class _ResultsPlaceholder extends StatelessWidget {
  const _ResultsPlaceholder(this.a);
  final AudienceState a;

  @override
  Widget build(BuildContext context) {
    final winner = a.result?['winner'];
    final confirmed = a.phase == 'RESULTS' && winner is Map;
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const _Dots(),
          const SizedBox(height: 40),
          Text(
            confirmed ? 'Winner: ${winner['label']}' : 'Calculating results…',
            style: const TextStyle(fontSize: 120, fontWeight: FontWeight.w500),
          ),
        ],
      ),
    );
  }
}
