import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:material_ui/material_ui.dart';

import '../../app/env.dart';
import '../../core/mock/mock_controller.dart';
import '../../core/widgets/widgets.dart';
import 'controller_auth.dart';
import 'controller_state.dart';
import 'panels/event_day_panel.dart';
import 'panels/event_status_panel.dart';
import 'panels/live_panel.dart';
import 'panels/players_panel.dart';
import 'panels/result_panels.dart';
import 'panels/setup_panels.dart';
import 'panels/treasure_panels.dart';
import 'widgets/common.dart';

/// The signed-in Controller dashboard: header, the main panel for the
/// current phase, and the Players and Event day cards on the side.
class ControllerDashboard extends ConsumerWidget {
  const ControllerDashboard({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final s = ref.watch(controllerProvider);
    return Scaffold(
      body: Column(
        children: [
          const TopStripe(),
          _Header(state: s),
          Expanded(
            child: !s.ready
                ? _Loading(error: s.loadError, onRetry: () => ref.read(controllerProvider.notifier).refresh())
                : LayoutBuilder(
                    builder: (context, box) {
                      final main = _MainPanel(state: s);
                      const side = [PlayersPanel(), EventDayPanel()];
                      if (box.maxWidth < 980) {
                        return ListView(
                          padding: const EdgeInsets.all(16),
                          children: [main, for (final p in side) ...[const SizedBox(height: 16), p]],
                        );
                      }
                      return Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Expanded(
                            child: SingleChildScrollView(padding: const EdgeInsets.fromLTRB(24, 24, 12, 24), child: main),
                          ),
                          SizedBox(
                            width: 440,
                            child: SingleChildScrollView(
                              padding: const EdgeInsets.fromLTRB(12, 24, 24, 24),
                              child: const Column(spacing: 16, children: side),
                            ),
                          ),
                        ],
                      );
                    },
                  ),
          ),
        ],
      ),
    );
  }
}

class _Loading extends StatelessWidget {
  const _Loading({this.error, required this.onRetry});
  final String? error;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    if (error == null) return const Center(child: CircularProgressIndicator());
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        spacing: 12,
        children: [
          Text(error!, style: TextStyle(color: context.hc.dangerText)),
          OutlinedButton(onPressed: onRetry, child: const Text('Try again')),
        ],
      ),
    );
  }
}

class _MainPanel extends StatelessWidget {
  const _MainPanel({required this.state});
  final ControllerState state;

  @override
  Widget build(BuildContext context) {
    if (!state.eventDay.open) return EventStatusPanel(state: state);
    return switch (state.phase) {
      'JOINING' => JoiningPanel(state: state),
      'TREASURE_REVIEW' => TreasurePanel(state: state),
      'READY' => ReadyPanel(state: state),
      'PLAYING' => LivePanel(state: state),
      'RESULT_PENDING' => ResultPanel(state: state),
      'RESULTS' => ConfirmedPanel(state: state),
      _ => SetupPanel(state: state),
    };
  }
}

class _Header extends ConsumerWidget {
  const _Header({required this.state});
  final ControllerState state;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.hc;
    final username = ref.watch(controllerAuthProvider.select((a) => a.username));
    // While the day is closing, the chip shows the event status, not the phase.
    final (label, tone) = phaseLabel(state.eventDay.open ? state.phase : state.eventDay.status);
    final wide = MediaQuery.sizeOf(context).width >= 1000;
    final roundNumber = state.round?.roundNumber;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
      decoration: BoxDecoration(color: c.surface, border: Border(bottom: BorderSide(color: c.border))),
      child: Row(
        spacing: 12,
        children: [
          const StripeDots(size: 10),
          const Text('Prompt Heist', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w500)),
          if (wide) Text('Controller', style: TextStyle(color: c.textSecondary)),
          if (wide && roundNumber != null && state.phase != 'SETUP')
            Text('· Round $roundNumber', style: TextStyle(color: c.textSecondary)),
          StatusChip(label, tone: tone),
          if (!state.connected) const StatusChip('Reconnecting…', tone: Tone.warning, icon: Icons.wifi_off),
          const Spacer(),
          if (Env.isMock) _DemoMenu(state: state),
          if (wide) Flexible(child: Text(username, overflow: TextOverflow.ellipsis, style: TextStyle(color: c.textSecondary))),
          TextButton(
            onPressed: () => ref.read(controllerAuthProvider.notifier).signOut(),
            child: const Text('Sign out'),
          ),
        ],
      ),
    );
  }
}

/// Mock flavour only: forces the paths the QE checks need.
class _DemoMenu extends ConsumerWidget {
  const _DemoMenu({required this.state});
  final ControllerState state;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final demo = MockController.demo;
    void run(VoidCallback f) {
      f();
      unawaited(ref.read(controllerProvider.notifier).refresh());
    }

    CheckedPopupMenuItem<VoidCallback> toggle(String key, String text) => CheckedPopupMenuItem(
      value: () => run(() => MockController.setDemo(key, demo[key] != true)),
      checked: demo[key] == true,
      child: Text(text),
    );

    return PopupMenuButton<VoidCallback>(
      tooltip: 'Mock controls',
      icon: Icon(Icons.science_outlined, color: context.hc.accent),
      onSelected: (f) => f(),
      itemBuilder: (_) => [
        PopupMenuItem(
          value: () => run(MockController.fillPlayers),
          enabled: state.phase == 'JOINING',
          child: const Text('Fill remaining players'),
        ),
        PopupMenuItem(
          value: () => run(MockController.toggleDisconnect),
          enabled: state.joinedCount >= 2,
          child: const Text('Disconnect / reconnect player 2'),
        ),
        PopupMenuItem(
          value: () => run(MockController.endRoundNow),
          enabled: state.phase == 'PLAYING',
          child: const Text('End round now'),
        ),
        const PopupMenuDivider(),
        toggle('failNextGeneration', 'Fail next treasure generation'),
        toggle('agentDown', 'Guard agent down'),
        toggle('tieAt100', 'Next round: tie at 100'),
        toggle('noScores', 'Next round: nobody scores'),
        toggle('failNextClose', 'Fail next event close'),
        const PopupMenuDivider(),
        PopupMenuItem(value: () => MockController.kickController(), child: const Text('Sign in elsewhere (kick)')),
      ],
    );
  }
}
