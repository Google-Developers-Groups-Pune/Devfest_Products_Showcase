import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:material_ui/material_ui.dart';

import '../../../core/widgets/widgets.dart';
import '../controller_api.dart';
import '../controller_state.dart';
import '../widgets/common.dart';

/// Stepper size for the round length (FE-12). No maximum.
const durationStep = 20;
const durationPresets = [60, 90, 120];
const defaultDuration = 90;

/// One step down, or null when that would reach zero or below.
int? durationDown(int seconds) => seconds - durationStep > 0 ? seconds - durationStep : null;
int durationUp(int seconds) => seconds + durationStep;

// ---------------------------------------------------------------- Setup

/// Open a new session (FE-12). Filled in from `lastSettings` when there are any.
class SetupPanel extends ConsumerStatefulWidget {
  const SetupPanel({super.key, required this.state});
  final ControllerState state;

  @override
  ConsumerState<SetupPanel> createState() => _SetupPanelState();
}

class _SetupPanelState extends ConsumerState<SetupPanel> {
  late int _capacity = widget.state.eventDay.lastCapacity ?? 5;
  late int _duration = widget.state.eventDay.lastDuration ?? defaultDuration;
  bool _busy = false;

  Future<void> _open() async {
    setState(() => _busy = true);
    try {
      await ref.read(controllerProvider.notifier).openSession(_capacity, _duration);
    } catch (e) {
      if (mounted) showActionError(context, controllerErrorText(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return HeistCard(
      title: 'Open a new session',
      subtitle: 'One active session at a time. Each player slot gets its own two-digit booth code.',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        spacing: 20,
        children: [
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            spacing: 8,
            children: [
              const FieldLabel('Players'),
              SegmentedButton<int>(
                segments: const [
                  ButtonSegment(value: 4, label: Text('4 players')),
                  ButtonSegment(value: 5, label: Text('5 players')),
                ],
                selected: {_capacity},
                onSelectionChanged: (v) => setState(() => _capacity = v.first),
              ),
            ],
          ),
          DurationEditor(seconds: _duration, onChanged: (v) => setState(() => _duration = v)),
          SizedBox(
            width: 240,
            child: FilledButton.icon(
              onPressed: _busy ? null : _open,
              icon: _busy ? const ButtonSpinner() : const Icon(Icons.play_circle_outline),
              label: const Text('Open session'),
            ),
          ),
        ],
      ),
    );
  }
}

/// Round length: a stepper in steps of 20 seconds, plus 60/90/120 presets.
/// It never goes to zero or below, and has no maximum.
class DurationEditor extends StatelessWidget {
  const DurationEditor({super.key, required this.seconds, required this.onChanged, this.enabled = true});

  final int seconds;
  final ValueChanged<int> onChanged;
  final bool enabled;

  @override
  Widget build(BuildContext context) {
    final c = context.hc;
    final down = durationDown(seconds);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      spacing: 8,
      children: [
        const FieldLabel('Prompt-battle duration'),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          crossAxisAlignment: WrapCrossAlignment.center,
          children: [
            IconButton.outlined(
              key: const Key('duration-down'),
              tooltip: '$durationStep seconds less',
              onPressed: enabled && down != null ? () => onChanged(down) : null,
              icon: const Icon(Icons.remove),
            ),
            Container(
              width: 120,
              padding: const EdgeInsets.symmetric(vertical: 8),
              alignment: Alignment.center,
              decoration: BoxDecoration(color: c.accentBg, borderRadius: BorderRadius.circular(999)),
              child: Text(
                '${seconds}s',
                key: const Key('duration-value'),
                style: context.mono(TextStyle(fontSize: 22, fontWeight: FontWeight.w500, color: c.accentText)),
              ),
            ),
            IconButton.outlined(
              key: const Key('duration-up'),
              tooltip: '$durationStep seconds more',
              onPressed: enabled ? () => onChanged(durationUp(seconds)) : null,
              icon: const Icon(Icons.add),
            ),
            for (final preset in durationPresets)
              ChoiceChip(
                label: Text('${preset}s${preset == defaultDuration ? ' (default)' : ''}'),
                selected: seconds == preset,
                onSelected: enabled ? (_) => onChanged(preset) : null,
              ),
          ],
        ),
        Text('Locks when the round starts.', style: TextStyle(fontSize: 12, color: c.textMuted)),
      ],
    );
  }
}

// ---------------------------------------------------------------- Abandon

/// "Abandon session" with a confirmation step and a required reason (FE-12).
/// Shown in Joining, Treasure review and Ready.
class AbandonButton extends ConsumerWidget {
  const AbandonButton({super.key});

  Future<void> _abandon(BuildContext context, WidgetRef ref) async {
    final reason = await askReason(
      context,
      title: 'Abandon this session?',
      message:
          'Every phone in this group is sent back to the start and no round is played. '
          'Their entrance IDs are released, so the same people can join a later session.',
      confirmLabel: 'Abandon session',
      hint: 'For example: only 3 players turned up',
    );
    if (reason == null || !context.mounted) return;
    try {
      await ref.read(controllerProvider.notifier).abandon(reason);
    } catch (e) {
      if (context.mounted) showActionError(context, controllerErrorText(e));
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.hc;
    return TextButton.icon(
      onPressed: () => _abandon(context, ref),
      style: TextButton.styleFrom(foregroundColor: c.dangerText),
      icon: const Icon(Icons.cancel_outlined, size: 18),
      label: const Text('Abandon session'),
    );
  }
}

// ---------------------------------------------------------------- Joining

/// Hand out booth codes (FE-12). Slot cards fill live as players join.
class JoiningPanel extends ConsumerStatefulWidget {
  const JoiningPanel({super.key, required this.state});
  final ControllerState state;

  @override
  ConsumerState<JoiningPanel> createState() => _JoiningPanelState();
}

class _JoiningPanelState extends ConsumerState<JoiningPanel> {
  bool _busy = false;

  Future<void> _generate() async {
    setState(() => _busy = true);
    try {
      await ref.read(controllerProvider.notifier).generateTreasure();
    } catch (e) {
      if (mounted) showActionError(context, controllerErrorText(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = widget.state;
    final c = context.hc;
    final capacity = s.session?.capacity ?? 5;
    return HeistCard(
      title: 'Hand out booth codes',
      subtitle: '${s.joinedCount} of $capacity players joined',
      trailing: const AbandonButton(),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        spacing: 20,
        children: [
          Wrap(spacing: 12, runSpacing: 12, children: [for (final slot in s.slots) CodeTile(slot: slot)]),
          _RoundLength(state: s),
          Row(
            spacing: 16,
            children: [
              FilledButton.icon(
                onPressed: s.allJoined && !_busy ? _generate : null,
                icon: _busy ? const ButtonSpinner() : const Icon(Icons.auto_awesome),
                label: const Text('Generate treasure'),
              ),
              if (!s.allJoined)
                Flexible(
                  child: Text(
                    'Waiting for all $capacity players (${capacity - s.joinedCount} to go). The round can\'t start early.',
                    style: TextStyle(color: c.textSecondary),
                  ),
                ),
            ],
          ),
        ],
      ),
    );
  }
}

/// Booth code tile for one slot.
class CodeTile extends StatelessWidget {
  const CodeTile({super.key, required this.slot});
  final CtlSlot slot;

  @override
  Widget build(BuildContext context) {
    final c = context.hc;
    final shape = shapeOf(slot.shape, slot.slotNumber);
    final (bg, fg) = shape.tone.colors(c);
    return AnimatedContainer(
      duration: const Duration(milliseconds: 250),
      width: 150,
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: slot.joined ? bg : c.card,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: slot.joined ? shape.color : c.border, width: slot.joined ? 2 : 1),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        spacing: 6,
        children: [
          Row(
            spacing: 6,
            children: [
              ShapeAvatar(shape, size: 18),
              Text('Slot ${slot.slotNumber}', style: TextStyle(fontSize: 12, color: c.textSecondary)),
            ],
          ),
          Text(slot.code, style: context.mono(TextStyle(fontSize: 40, fontWeight: FontWeight.w500, color: c.text))),
          Text(
            slot.player?.label ?? 'Not claimed',
            overflow: TextOverflow.ellipsis,
            style: TextStyle(fontWeight: FontWeight.w500, color: slot.joined ? fg : c.textMuted),
          ),
        ],
      ),
    );
  }
}

/// Round length with a Change link, while it can still change (FE-12, FE-14).
class _RoundLength extends ConsumerStatefulWidget {
  const _RoundLength({required this.state});
  final ControllerState state;

  @override
  ConsumerState<_RoundLength> createState() => _RoundLengthState();
}

class _RoundLengthState extends ConsumerState<_RoundLength> {
  bool _editing = false;

  Future<void> _set(int v) async {
    try {
      await ref.read(controllerProvider.notifier).setDuration(v);
    } catch (e) {
      if (mounted) showActionError(context, controllerErrorText(e));
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.hc;
    final seconds = widget.state.session?.roundDurationSeconds ?? defaultDuration;
    if (_editing) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        spacing: 8,
        children: [
          DurationEditor(seconds: seconds, onChanged: _set),
          TextButton(onPressed: () => setState(() => _editing = false), child: const Text('Done')),
        ],
      );
    }
    return Row(
      spacing: 8,
      children: [
        Icon(Icons.timer_outlined, size: 20, color: c.textSecondary),
        Text('Round length: ', style: TextStyle(color: c.textSecondary)),
        Text('${seconds}s', style: context.mono(const TextStyle(fontWeight: FontWeight.w500))),
        TextButton(onPressed: () => setState(() => _editing = true), child: const Text('Change')),
      ],
    );
  }
}

/// Exposed for the Ready panel.
class RoundLength extends StatelessWidget {
  const RoundLength({super.key, required this.state});
  final ControllerState state;

  @override
  Widget build(BuildContext context) => _RoundLength(state: state);
}
