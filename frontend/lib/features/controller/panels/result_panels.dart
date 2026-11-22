import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:material_ui/material_ui.dart';
import 'package:uuid/uuid.dart';

import '../../../core/widgets/widgets.dart';
import '../controller_api.dart';
import '../controller_state.dart';
import '../widgets/common.dart';

// ---------------------------------------------------------------- Result review

/// Confirm or discard. Nothing else (FE-16). There is no way to pick a
/// different winner: Confirm is named after the system's winner.
class ResultPanel extends ConsumerStatefulWidget {
  const ResultPanel({super.key, required this.state});
  final ControllerState state;

  @override
  ConsumerState<ResultPanel> createState() => _ResultPanelState();
}

class _ResultPanelState extends ConsumerState<ResultPanel> {
  bool _busy = false;

  Future<void> _confirm() async {
    setState(() => _busy = true);
    try {
      await ref.read(controllerProvider.notifier).confirm();
    } catch (e) {
      if (mounted) showActionError(context, controllerErrorText(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _discard() async {
    final reason = await askReason(
      context,
      title: 'Discard this round?',
      message:
          'No winner is recorded and this session ends. Every phone shows that the round was cancelled; '
          'the reason stays in the audit log and is never shown to players or the big screen. '
          'Entrance IDs are released, so these people can join a new session with new codes.',
      confirmLabel: 'Discard round',
      hint: 'For example: Wi-Fi dropped for two players',
    );
    if (reason == null || !mounted) return;
    setState(() => _busy = true);
    try {
      await ref.read(controllerProvider.notifier).discard(reason);
    } catch (e) {
      if (mounted) showActionError(context, controllerErrorText(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.hc;
    final r = widget.state.result;
    return HeistCard(
      title: 'Provisional result',
      subtitle: 'Calculated from stored scores and server timestamps. Confirm it or discard the round.',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        spacing: 16,
        children: [
          if (r == null)
            Row(
              spacing: 12,
              children: [
                const SizedBox.square(dimension: 20, child: CircularProgressIndicator(strokeWidth: 2)),
                Text('Calculating the result…', style: TextStyle(color: c.textSecondary)),
              ],
            )
          else ...[
            for (final row in r.ranking) RankingRow(row: row, leading: row.rank == 1 && r.hasWinner),
            if (r.tieBreakExplanation != null)
              _Banner(icon: Icons.balance, text: r.tieBreakExplanation!, tone: Tone.accent),
            if (!r.canConfirm)
              const _Banner(
                icon: Icons.info_outline,
                tone: Tone.warning,
                text: 'Nobody scored this round, so there is no winner to confirm. '
                    'Discard the round; the players can join a new session.',
              ),
          ],
          Wrap(
            spacing: 12,
            runSpacing: 12,
            children: [
              if (r != null && r.canConfirm)
                FilledButton.icon(
                  key: const Key('confirm-winner'),
                  onPressed: _busy ? null : _confirm,
                  icon: _busy ? const ButtonSpinner() : const Icon(Icons.emoji_events_outlined),
                  label: Text('Confirm ${r.winnerLabel}'),
                ),
              OutlinedButton.icon(
                key: const Key('discard-round'),
                onPressed: _busy ? null : _discard,
                style: OutlinedButton.styleFrom(foregroundColor: c.dangerText, side: BorderSide(color: c.dangerBorder)),
                icon: const Icon(Icons.delete_outline),
                label: const Text('Discard round'),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class RankingRow extends StatelessWidget {
  const RankingRow({super.key, required this.row, this.leading = false});
  final RankRow row;
  final bool leading;

  @override
  Widget build(BuildContext context) {
    final c = context.hc;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
      decoration: BoxDecoration(color: leading ? c.successBg : c.card, borderRadius: BorderRadius.circular(16)),
      child: Row(
        spacing: 12,
        children: [
          SizedBox(width: 36, child: Text(ordinal(row.rank), style: context.mono(TextStyle(color: c.textSecondary)))),
          ShapeAvatar(shapeOf(row.shape, row.slotNumber), size: 20),
          Expanded(child: Text(row.label, style: const TextStyle(fontWeight: FontWeight.w500))),
          if (row.decidingSequence != null)
            Text('deciding #${row.decidingSequence}', style: context.mono(TextStyle(fontSize: 12, color: c.textMuted))),
          ScoreChip(row.bestScore, size: 36),
        ],
      ),
    );
  }
}

class _Banner extends StatelessWidget {
  const _Banner({required this.icon, required this.text, required this.tone});
  final IconData icon;
  final String text;
  final Tone tone;

  @override
  Widget build(BuildContext context) {
    final (bg, fg) = tone.colors(context.hc);
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(16)),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        spacing: 8,
        children: [
          Icon(icon, size: 18, color: fg),
          Expanded(child: Text(text, style: TextStyle(color: fg, height: 1.4))),
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------- Confirmed

/// Winner confirmed; hand over to the next group on command (FE-27).
/// Nothing happens on a timer: the session stays here until a button is used.
class ConfirmedPanel extends ConsumerStatefulWidget {
  const ConfirmedPanel({super.key, required this.state});
  final ControllerState state;

  @override
  ConsumerState<ConfirmedPanel> createState() => _ConfirmedPanelState();
}

class _ConfirmedPanelState extends ConsumerState<ConfirmedPanel> {
  static const _uuid = Uuid();
  bool _busy = false;

  Future<void> _nextGroup() async {
    if (_busy) return;
    setState(() => _busy = true);
    try {
      // One key per click: a double click cannot open two sessions.
      await ref.read(controllerProvider.notifier).nextGroup(_uuid.v4());
    } catch (e) {
      if (mounted) showActionError(context, controllerErrorText(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _endSession() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('End the session?'),
        content: const SizedBox(
          width: 420,
          child: Text('Use this for the last group of the day. No new booth codes are issued until you open a session.'),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(dialogContext, false), child: const Text('Cancel')),
          FilledButton(
            style: FilledButton.styleFrom(minimumSize: const Size(0, 44)),
            onPressed: () => Navigator.pop(dialogContext, true),
            child: const Text('End session'),
          ),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    setState(() => _busy = true);
    try {
      await ref.read(controllerProvider.notifier).endSession();
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
    final r = s.result;
    // Match by player ID from the winning ranking row; slot number as fallback.
    final winnerId = r?.ranking.where((x) => x.rank == 1).firstOrNull?.playerId;
    final player = s.slots.map((x) => x.player).whereType<CtlPlayer>().where((p) => p.id == winnerId).firstOrNull ??
        s.slots.where((x) => x.slotNumber == r?.winnerSlot).firstOrNull?.player;
    return HeistCard(
      title: 'Winner confirmed',
      subtitle: 'The big screen shows the result while the MC tells the story.',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        spacing: 16,
        children: [
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 28),
            decoration: BoxDecoration(color: const Color(0xFF1E8E3E), borderRadius: BorderRadius.circular(20)),
            child: Column(
              spacing: 6,
              children: [
                const Icon(Icons.emoji_events, color: Colors.white, size: 40),
                Text(
                  r?.winnerLabel ?? '…',
                  style: const TextStyle(color: Colors.white, fontSize: 32, fontWeight: FontWeight.w500),
                ),
                Text(
                  '${r?.winnerScore ?? ''} points · ${s.treasure?.title ?? ''}',
                  style: const TextStyle(color: Colors.white, fontSize: 16),
                ),
              ],
            ),
          ),
          if (player != null)
            Row(
              spacing: 8,
              children: [
                Icon(Icons.task_alt, size: 18, color: c.successText),
                Expanded(
                  child: Text(
                    'Recorded for the CSV: ${player.fullName} · ${player.entranceId} · round ${s.round?.roundNumber ?? ''}',
                    style: TextStyle(color: c.textSecondary),
                  ),
                ),
              ],
            ),
          Wrap(
            spacing: 12,
            runSpacing: 12,
            children: [
              SizedBox(
                width: 240,
                child: FilledButton.icon(
                  key: const Key('next-group'),
                  onPressed: _busy ? null : _nextGroup,
                  icon: _busy ? const ButtonSpinner() : const Icon(Icons.group_add_outlined),
                  label: const Text('Next group'),
                ),
              ),
              OutlinedButton.icon(
                key: const Key('end-session'),
                onPressed: _busy ? null : _endSession,
                icon: const Icon(Icons.stop_circle_outlined),
                label: const Text('End session'),
              ),
            ],
          ),
          Text(
            'Next group opens new booth codes for ${s.session?.capacity ?? ''} players with a '
            '${s.session?.roundDurationSeconds ?? ''}s round, the same as this one.',
            style: TextStyle(fontSize: 12, color: c.textMuted),
          ),
        ],
      ),
    );
  }
}
