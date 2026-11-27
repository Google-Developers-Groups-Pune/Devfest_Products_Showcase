import 'package:material_ui/material_ui.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../app/env.dart';
import '../../../core/realtime/game_socket.dart';
import '../../../core/realtime/socket_providers.dart';
import '../../../core/timer/countdown.dart';
import '../../../core/widgets/widgets.dart';
import '../widgets/player_ui.dart';
import 'game_state.dart';
import 'prompt_tile.dart';
import '../../../core/mock/mock_socket.dart';

class BattlePage extends ConsumerStatefulWidget {
  const BattlePage({super.key});

  @override
  ConsumerState<BattlePage> createState() => _BattlePageState();
}

class _BattlePageState extends ConsumerState<BattlePage> {
  final _text = TextEditingController();
  final _focus = FocusNode();

  @override
  void dispose() {
    _text.dispose();
    _focus.dispose();
    super.dispose();
  }

  void _send() {
    if (_text.text.trim().isEmpty) return;
    ref.read(gameProvider.notifier).submit(_text.text);
    _text.clear();
    _focus.requestFocus(); // keep the keyboard open
    setState(() {});
  }

  void _edit(String text) {
    _text.text = text;
    _text.selection = TextSelection.collapsed(offset: text.length);
    _focus.requestFocus();
    setState(() {});
  }

  @override
  Widget build(BuildContext context) {
    final game = ref.watch(gameProvider);
    final clock = ref.watch(countdownProvider);
    final socket = ref.watch(playerSocketProvider);
    final socketStatus =
        ref.watch(socketStatusProvider).value ?? socket.currentStatus;
    final reconnecting = socketStatus == SocketStatus.reconnecting;

    if (!game.ready || game.round == null || game.treasure == null) {
      return const PlayerLoading(message: 'Waiting for the round to start…');
    }

    final c = context.hc;
    final total = game.round!.durationSeconds * 1000;
    final progress = clock.active
        ? (clock.remaining.inMilliseconds / total).clamp(0.0, 1.0)
        : 1.0;
    final paused = reconnecting || clock.reconnecting || !clock.active;
    final tone = paused ? Tone.neutral : TimerPill.toneFor(clock.remaining);
    final barColor = switch (tone) {
      Tone.danger => HeistColors.red,
      Tone.warning => HeistColors.yellow,
      _ => HeistColors.blue,
    };
    final bestChip = _BestChip(
      game.bestScore,
      // Mock only: long-press to test the reconnecting state.
      onLongPress: Env.isMock && socket is MockGameSocket
          ? () => socket.simulateOffline(const Duration(seconds: 10))
          : null,
    );

    if (game.locked) {
      return _UnlockedView(clock: clock, reconnecting: reconnecting);
    }

    return PlayerPage(
      top: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        spacing: 10,
        children: [
          if (reconnecting) const _ReconnectingBanner(),
          Row(
            children: [
              TimerPill(
                remaining: clock.active ? clock.remaining : null,
                tone: tone,
                size: TimerPillSize.small,
              ),
              const Spacer(),
              bestChip,
            ],
          ),
          ClipRRect(
            borderRadius: BorderRadius.circular(999),
            child: LinearProgressIndicator(
              value: progress,
              minHeight: 4,
              color: barColor,
              backgroundColor: c.border,
            ),
          ),
        ],
      ),
      content: [
        _TreasureCard(game.treasure!),
        if (game.prompts.isEmpty)
          const InfoCard(
            child: IconLine(
              Icons.tips_and_updates_outlined,
              'Write a prompt below to convince the Guard. Cover every part '
              'of the objective to reach 100.',
            ),
          )
        else
          Text(
            'Your prompts',
            style: TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w500,
              color: c.textSecondary,
            ),
          ),
        for (final p in game.prompts.reversed)
          PromptTile(
            p,
            key: ValueKey(p.key),
            onRetry: () => ref.read(gameProvider.notifier).retry(p),
            onEdit: () => _edit(p.text),
          ),
      ],
      bottom: [_composer(c, game.canSubmit, reconnecting)],
    );
  }

  Widget _composer(HeistColors c, bool enabled, bool reconnecting) {
    final length = _text.text.length;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      spacing: 4,
      children: [
        if (length > 0)
          Text(
            '$length / 200',
            textAlign: TextAlign.right,
            style: context.mono(
              TextStyle(
                fontSize: 11,
                color: length > 170 ? c.warningText : c.textMuted,
              ),
            ),
          ),
        Container(
          padding: const EdgeInsets.fromLTRB(16, 6, 6, 6),
          decoration: BoxDecoration(
            color: enabled ? c.surface : c.card,
            borderRadius: BorderRadius.circular(26),
            border: Border.all(color: c.borderStrong),
          ),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            spacing: 8,
            children: [
              Expanded(
                child: TextField(
                  key: const Key('promptField'),
                  controller: _text,
                  focusNode: _focus,
                  enabled: enabled,
                  minLines: 1,
                  maxLines: 5,
                  maxLength: 200,
                  buildCounter: (
                    _, {
                    required currentLength,
                    required isFocused,
                    maxLength,
                  }) => null,
                  textInputAction: TextInputAction.send,
                  onChanged: (_) => setState(() {}),
                  onSubmitted: (_) => _send(),
                  decoration: InputDecoration(
                    hintText: reconnecting
                        ? 'Paused until you are back online'
                        : 'Write your prompt…',
                    filled: false,
                    border: InputBorder.none,
                    enabledBorder: InputBorder.none,
                    focusedBorder: InputBorder.none,
                    disabledBorder: InputBorder.none,
                    contentPadding: const EdgeInsets.symmetric(vertical: 12),
                  ),
                ),
              ),
              IconButton.filled(
                key: const Key('sendButton'),
                tooltip: 'Send',
                style: IconButton.styleFrom(
                  backgroundColor: c.accent,
                  foregroundColor: c.onAccent,
                  disabledBackgroundColor: c.border,
                  minimumSize: const Size(48, 48),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(16),
                  ),
                ),
                onPressed: enabled && _text.text.trim().isNotEmpty
                    ? _send
                    : null,
                icon: const Icon(Icons.send_rounded),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

/// The countdown pill: blue, yellow in the last 30 s, red in the last 10 s.
/// FE-10: shown after this player reaches 100. There is no input and the
/// timer keeps running, because the winner is decided at 00:00.
class _UnlockedView extends StatelessWidget {
  const _UnlockedView({required this.clock, required this.reconnecting});
  final CountdownState clock;
  final bool reconnecting;

  static const _ink = HeistColors.ink;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      key: const Key('unlockedBanner'),
      backgroundColor: HeistColors.yellow,
      body: SafeArea(
        child: Stack(
          children: [
            const Positioned(
              left: -30,
              top: 60,
              child: _Blob(HeistColors.red, 96, 48),
            ),
            Positioned(
              right: -14,
              top: 170,
              child: Transform.rotate(
                angle: 0.38,
                child: const _Blob(HeistColors.blue, 72, 20),
              ),
            ),
            Positioned(
              left: 24,
              bottom: 90,
              child: Transform.rotate(
                angle: -0.2,
                child: const _Blob(HeistColors.green, 130, 999, height: 46),
              ),
            ),
            Column(
              children: [
                if (reconnecting)
                  const Padding(
                    padding: EdgeInsets.fromLTRB(16, 12, 16, 0),
                    child: _ReconnectingBanner(),
                  ),
                Expanded(
                  child: Center(
                    child: TweenAnimationBuilder<double>(
                      tween: Tween(begin: 0.5, end: 1),
                      duration: const Duration(milliseconds: 900),
                      curve: Curves.elasticOut,
                      builder: (context, t, child) =>
                          Transform.scale(scale: t, child: child),
                      child: Padding(
                        padding: const EdgeInsets.all(24),
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          spacing: 12,
                          children: [
                            Transform.rotate(
                              angle: -0.1,
                              child: Container(
                                width: 104,
                                height: 104,
                                decoration: BoxDecoration(
                                  color: Colors.white,
                                  borderRadius: BorderRadius.circular(32),
                                ),
                                child: const Icon(
                                  Icons.lock_open_rounded,
                                  size: 52,
                                  color: HeistColors.onYellowIcon,
                                ),
                              ),
                            ),
                            Text(
                              '100',
                              style: context.mono(
                                const TextStyle(
                                  fontSize: 64,
                                  fontWeight: FontWeight.w500,
                                  color: _ink,
                                  height: 1,
                                ),
                              ),
                            ),
                            const Text(
                              'Treasure unlocked!',
                              style: TextStyle(
                                fontSize: 26,
                                fontWeight: FontWeight.w500,
                                color: _ink,
                              ),
                            ),
                            const SizedBox(
                              width: 280,
                              child: Text(
                                'You scored 100. The winner is decided when the '
                                'timer hits 00:00. The earliest 100 wins a tie.',
                                textAlign: TextAlign.center,
                                style: TextStyle(
                                  fontSize: 14,
                                  color: HeistColors.onYellowBody,
                                  height: 1.4,
                                ),
                              ),
                            ),
                            if (clock.active)
                              Container(
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 16,
                                  vertical: 8,
                                ),
                                decoration: BoxDecoration(
                                  color: Colors.white,
                                  borderRadius: BorderRadius.circular(999),
                                ),
                                child: Text(
                                  '${clock.label} left',
                                  style: context.mono(
                                    const TextStyle(
                                      fontSize: 15,
                                      fontWeight: FontWeight.w500,
                                      color: _ink,
                                    ),
                                  ),
                                ),
                              ),
                          ],
                        ),
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _Blob extends StatelessWidget {
  const _Blob(this.color, this.width, this.radius, {this.height});
  final Color color;
  final double width;
  final double radius;
  final double? height;

  @override
  Widget build(BuildContext context) => Container(
    width: width,
    height: height ?? width,
    decoration: BoxDecoration(
      color: color,
      borderRadius: BorderRadius.circular(radius),
    ),
  );
}

class _ReconnectingBanner extends StatelessWidget {
  const _ReconnectingBanner();

  @override
  Widget build(BuildContext context) {
    final c = context.hc;
    return InfoCard(
      tone: Tone.warning,
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
      child: Row(
        spacing: 10,
        children: [
          SizedBox.square(
            dimension: 14,
            child: CircularProgressIndicator(
              strokeWidth: 2,
              color: c.warningText,
            ),
          ),
          const Expanded(
            child: Text('Reconnecting… your game is still running.'),
          ),
        ],
      ),
    );
  }
}

class _BestChip extends StatelessWidget {
  const _BestChip(this.best, {this.onLongPress});
  final int? best;
  final VoidCallback? onLongPress;

  @override
  Widget build(BuildContext context) => GestureDetector(
    onLongPress: onLongPress,
    child: StatusChip(
      best == null ? 'No score yet' : 'Best $best',
      tone: scoreTone(best),
    ),
  );
}

class _TreasureCard extends StatelessWidget {
  const _TreasureCard(this.t);
  final Treasure t;

  void _story(BuildContext context) {
    final c = context.hc;
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      backgroundColor: c.surface,
      builder: (_) => SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(24, 0, 24, 24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            spacing: 12,
            children: [
              Text(
                t.title,
                style: TextStyle(
                  fontSize: 22,
                  fontWeight: FontWeight.w500,
                  color: c.text,
                ),
              ),
              Text(
                t.backstory,
                style: TextStyle(
                  fontSize: 16,
                  height: 1.5,
                  color: c.textSecondary,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final c = context.hc;
    return ClipRRect(
      borderRadius: BorderRadius.circular(16),
      child: ColoredBox(
        color: c.warningBg,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            AspectRatio(aspectRatio: 16 / 9, child: TreasureImage(t.imageUrl)),
            Padding(
              padding: const EdgeInsets.fromLTRB(14, 12, 8, 14),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                spacing: 6,
                children: [
                  Row(
                    spacing: 8,
                    children: [
                      Icon(
                        Icons.diamond_outlined,
                        color: c.warningText,
                        size: 22,
                      ),
                      Expanded(
                        child: Text(
                          t.title,
                          style: TextStyle(
                            fontSize: 17,
                            fontWeight: FontWeight.w500,
                            color: c.text,
                          ),
                        ),
                      ),
                      TextButton(
                        onPressed: () => _story(context),
                        style: TextButton.styleFrom(
                          foregroundColor: c.warningText,
                          minimumSize: const Size(0, 32),
                          padding: const EdgeInsets.symmetric(horizontal: 10),
                          textStyle: const TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.w500,
                            fontFamily: HeistFonts.sans,
                          ),
                        ),
                        child: const Text('Read the story'),
                      ),
                    ],
                  ),
                  Text.rich(
                    TextSpan(
                      children: [
                        const TextSpan(
                          text: 'Objective: ',
                          style: TextStyle(fontWeight: FontWeight.w500),
                        ),
                        TextSpan(text: t.lockObjective),
                      ],
                    ),
                    style: TextStyle(fontSize: 14, color: c.text, height: 1.45),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
