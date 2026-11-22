import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:material_ui/material_ui.dart';

import '../../../core/widgets/widgets.dart';
import '../controller_api.dart';
import '../controller_state.dart';
import '../widgets/common.dart';

/// Side panel: every slot with label, full name, entrance ID, status and
/// score (FE-12), plus name review before the round (FE-28).
class PlayersPanel extends ConsumerWidget {
  const PlayersPanel({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final s = ref.watch(controllerProvider);
    final c = context.hc;
    final showScores = const ['PLAYING', 'RESULT_PENDING', 'RESULTS'].contains(s.phase);
    final reviewing = s.beforeRound;
    final pending = s.pendingNames;
    return HeistCard(
      title: 'Players',
      subtitle: s.session == null
          ? 'No session open'
          : '${s.joinedCount} of ${s.session!.capacity} joined'
              '${reviewing && pending > 0 ? ' · $pending name${pending == 1 ? '' : 's'} to review' : ''}',
      child: s.session == null || s.slots.isEmpty
          ? Text('Open a session to issue booth codes.', style: TextStyle(color: c.textMuted))
          : Column(
              spacing: 8,
              children: [
                for (final slot in s.slots) _PlayerRow(slot: slot, showScore: showScores, reviewing: reviewing),
                Row(
                  spacing: 6,
                  children: [
                    Icon(Icons.lock_outline, size: 14, color: c.textMuted),
                    Expanded(
                      child: Text(
                        'Full names and entrance IDs are Controller-only and deleted at close.',
                        style: TextStyle(fontSize: 11, color: c.textMuted),
                      ),
                    ),
                  ],
                ),
              ],
            ),
    );
  }
}

class _PlayerRow extends ConsumerStatefulWidget {
  const _PlayerRow({required this.slot, required this.showScore, required this.reviewing});
  final CtlSlot slot;
  final bool showScore;
  final bool reviewing;

  @override
  ConsumerState<_PlayerRow> createState() => _PlayerRowState();
}

class _PlayerRowState extends ConsumerState<_PlayerRow> {
  bool _busy = false;

  Future<void> _run(Future<void> Function() action) async {
    setState(() => _busy = true);
    try {
      await action();
    } catch (e) {
      if (mounted) showActionError(context, controllerErrorText(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _rename(CtlPlayer p) async {
    final name = await showDialog<String>(context: context, builder: (_) => _RenameDialog(current: p.fullName));
    if (name == null || !mounted) return;
    await _run(() => ref.read(controllerProvider.notifier).renamePlayer(p.id, name));
  }

  @override
  Widget build(BuildContext context) {
    final c = context.hc;
    final slot = widget.slot;
    final p = slot.player;
    final (label, tone) = slotLabel(slot.slotState);
    final needsReview = widget.reviewing && p != null && !p.nameApproved;
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: c.card,
        borderRadius: BorderRadius.circular(16),
        border: needsReview ? Border.all(color: c.warningText.withValues(alpha: 0.6)) : null,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        spacing: 10,
        children: [
          Row(
            spacing: 12,
            children: [
              ShapeAvatar(shapeOf(slot.shape, slot.slotNumber), size: 24),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  spacing: 2,
                  children: [
                    Text(p?.label ?? 'Slot ${slot.slotNumber}', overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w500)),
                    Text(
                      p == null ? 'Code ${slot.code}' : '${p.fullName} · ${p.entranceId}',
                      overflow: TextOverflow.ellipsis,
                      style: context.mono(TextStyle(fontSize: 11, color: c.textSecondary)),
                    ),
                  ],
                ),
              ),
              StatusChip(label, tone: tone),
              if (widget.showScore) ScoreChip(p?.bestScore, size: 34),
            ],
          ),
          if (widget.reviewing && p != null)
            p.nameApproved
                ? Row(
                    spacing: 6,
                    children: [
                      Icon(Icons.verified_user_outlined, size: 14, color: c.successText),
                      Text('Name reviewed', style: TextStyle(fontSize: 12, color: c.successText)),
                    ],
                  )
                : Row(
                    spacing: 8,
                    children: [
                      Icon(Icons.rate_review_outlined, size: 16, color: c.warningText),
                      Expanded(child: Text('Check this name', style: TextStyle(fontSize: 12, color: c.warningText))),
                      if (_busy) const ButtonSpinner(),
                      OutlinedButton(
                        key: Key('reject-name-${slot.slotNumber}'),
                        onPressed: _busy ? null : () => _rename(p),
                        style: OutlinedButton.styleFrom(
                          minimumSize: const Size(0, 34),
                          foregroundColor: c.dangerText,
                          padding: const EdgeInsets.symmetric(horizontal: 14),
                        ),
                        child: const Text('Reject'),
                      ),
                      FilledButton(
                        key: Key('approve-name-${slot.slotNumber}'),
                        onPressed: _busy ? null : () => _run(() => ref.read(controllerProvider.notifier).approveName(p.id)),
                        style: FilledButton.styleFrom(minimumSize: const Size(0, 34), padding: const EdgeInsets.symmetric(horizontal: 14)),
                        child: const Text('Approve'),
                      ),
                    ],
                  ),
        ],
      ),
    );
  }
}

/// Reject a name: the Controller types the replacement (FE-28). It replaces
/// the name everywhere, including the CSV.
class _RenameDialog extends StatefulWidget {
  const _RenameDialog({required this.current});
  final String current;

  @override
  State<_RenameDialog> createState() => _RenameDialogState();
}

class _RenameDialogState extends State<_RenameDialog> {
  final _name = TextEditingController();
  String? _error;

  @override
  void dispose() {
    _name.dispose();
    super.dispose();
  }

  void _submit() {
    final n = _name.text.trim();
    if (n.isEmpty) {
      setState(() => _error = 'Type the replacement name.');
      return;
    }
    Navigator.pop(context, n);
  }

  @override
  Widget build(BuildContext context) {
    final c = context.hc;
    return AlertDialog(
      title: const Text('Replace this name'),
      content: SizedBox(
        width: 420,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          spacing: 14,
          children: [
            Text(
              'Ask the player for a suitable name and type it here. It replaces "${widget.current}" everywhere, '
              'including the big screen and the winners CSV.',
              style: TextStyle(color: c.textSecondary, height: 1.5),
            ),
            TextField(
              key: const Key('rename-field'),
              controller: _name,
              autofocus: true,
              decoration: InputDecoration(labelText: 'Full name', errorText: _error),
              onChanged: (_) => setState(() => _error = null),
              onSubmitted: (_) => _submit(),
            ),
          ],
        ),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancel')),
        FilledButton(
          key: const Key('rename-save'),
          style: FilledButton.styleFrom(minimumSize: const Size(0, 44)),
          onPressed: _submit,
          child: const Text('Replace and approve'),
        ),
      ],
    );
  }
}
