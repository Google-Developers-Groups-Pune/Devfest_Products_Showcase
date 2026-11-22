import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:material_ui/material_ui.dart';

import '../../../core/widgets/widgets.dart';
import '../controller_api.dart';
import '../controller_state.dart';
import '../widgets/common.dart';

/// Side card on every screen: winners, CSV export, close the day (FE-17),
/// and the audit log, newest first (FE-18).
class EventDayPanel extends ConsumerStatefulWidget {
  const EventDayPanel({super.key});

  @override
  ConsumerState<EventDayPanel> createState() => _EventDayPanelState();
}

class _EventDayPanelState extends ConsumerState<EventDayPanel> {
  bool _exporting = false;
  bool _showAllAudit = false;

  Future<void> _export() async {
    setState(() => _exporting = true);
    try {
      await ref.read(controllerProvider.notifier).exportCsv();
      if (mounted) {
        ScaffoldMessenger.maybeOf(context)?.showSnackBar(
          const SnackBar(behavior: SnackBarBehavior.floating, content: Text('prompt-heist-winners.csv downloaded')),
        );
      }
    } catch (e) {
      if (mounted) showActionError(context, controllerErrorText(e));
    } finally {
      if (mounted) setState(() => _exporting = false);
    }
  }

  Future<void> _close(ControllerState s) async {
    final ok = await showDialog<bool>(context: context, builder: (_) => CloseEventDialog(state: s));
    if (ok != true || !mounted) return;
    try {
      await ref.read(controllerProvider.notifier).closeEvent();
    } catch (e) {
      if (mounted) showActionError(context, controllerErrorText(e));
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = ref.watch(controllerProvider);
    final c = context.hc;
    final ev = s.eventDay;
    final open = ev.open;
    final n = ev.winners.length;
    final audit = _showAllAudit ? s.audit : s.audit.take(8).toList();
    return HeistCard(
      title: 'Event day',
      subtitle: '$n confirmed winner${n == 1 ? '' : 's'}',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        spacing: 12,
        children: [
          for (final w in ev.winners)
            Row(
              spacing: 10,
              children: [
                const Icon(Icons.emoji_events_outlined, size: 18, color: HeistColors.yellow),
                Text('R${w.roundNumber}', style: context.mono(TextStyle(color: c.textMuted))),
                Expanded(child: Text(w.fullName, overflow: TextOverflow.ellipsis)),
                Text('${w.score}', style: context.mono(const TextStyle(fontWeight: FontWeight.w500))),
              ],
            ),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              OutlinedButton.icon(
                key: const Key('export-csv'),
                // Enabled at zero winners: an empty CSV is needed to close the day.
                onPressed: open && !_exporting ? _export : null,
                icon: _exporting ? const ButtonSpinner() : const Icon(Icons.download_outlined),
                label: const Text('Export winners CSV'),
              ),
              OutlinedButton.icon(
                key: const Key('close-event'),
                onPressed: open ? () => _close(s) : null,
                style: OutlinedButton.styleFrom(foregroundColor: c.dangerText),
                icon: const Icon(Icons.lock_clock_outlined),
                label: const Text('Close event day'),
              ),
            ],
          ),
          if (open) _CsvStatus(eventDay: ev),
          if (s.audit.isNotEmpty) ...[
            const SizedBox(height: 4),
            Text('Audit log', style: TextStyle(fontWeight: FontWeight.w500, color: c.textSecondary)),
            for (final a in audit)
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                spacing: 10,
                children: [
                  Text(clockTime(a.at), style: context.mono(TextStyle(fontSize: 11, color: c.textMuted))),
                  Expanded(
                    child: Text(
                      a.reason == null ? a.summary : '${a.summary} · "${a.reason}"',
                      style: const TextStyle(fontSize: 12),
                    ),
                  ),
                ],
              ),
            if (s.audit.length > 8 || s.auditNextCursor != null)
              Align(
                alignment: Alignment.centerLeft,
                child: TextButton(
                  onPressed: () {
                    if (!_showAllAudit) {
                      setState(() => _showAllAudit = true);
                    } else {
                      ref.read(controllerProvider.notifier).loadAudit(more: true);
                    }
                  },
                  child: Text(!_showAllAudit ? 'Show all' : 'Load older entries'),
                ),
              ),
          ],
        ],
      ),
    );
  }
}

class _CsvStatus extends StatelessWidget {
  const _CsvStatus({required this.eventDay});
  final EventDay eventDay;

  @override
  Widget build(BuildContext context) {
    final at = eventDay.csvExportedAt;
    if (at == null) {
      return const ReasonLine('Not exported yet. Export before closing the day, even with no winners.', tone: Tone.neutral);
    }
    if (eventDay.csvUpToDate) {
      return ReasonLine('Exported at ${clockTime(at)}. Covers every winner.', tone: Tone.success, icon: Icons.task_alt);
    }
    return ReasonLine('Exported at ${clockTime(at)}, but new winners since. Export again before closing.');
  }
}

/// Close the event day (FE-17, designed by dev). Blocked until a CSV covering
/// every winner has been exported (D44). Then the Controller types
/// CLOSE EVENT, matching the API's confirmation field.
class CloseEventDialog extends StatefulWidget {
  const CloseEventDialog({super.key, required this.state});
  final ControllerState state;

  @override
  State<CloseEventDialog> createState() => _CloseEventDialogState();
}

class _CloseEventDialogState extends State<CloseEventDialog> {
  final _typed = TextEditingController();

  @override
  void dispose() {
    _typed.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final c = context.hc;
    final s = widget.state;
    final csvOk = s.eventDay.csvUpToDate;
    final live = s.phase != 'SETUP';
    final match = _typed.text.trim() == 'CLOSE EVENT';
    return AlertDialog(
      icon: Icon(Icons.lock_clock_outlined, color: c.dangerText),
      title: const Text('Close the event day?'),
      content: SizedBox(
        width: 460,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          spacing: 14,
          children: [
            Text(
              'This deletes every name, entrance ID, prompt, score, treasure, winner record and audit entry. '
              "It can't be undone.",
              style: TextStyle(color: c.textSecondary, height: 1.5),
            ),
            if (live)
              ReasonLine(
                'A session is still open (${phaseLabel(s.phase).$1}). Closing stops it, and any unconfirmed result is lost.',
                tone: Tone.danger,
                icon: Icons.warning_amber_rounded,
              ),
            if (!csvOk)
              ReasonLine(
                s.eventDay.csvExportedAt == null
                    ? 'Blocked: export the winners CSV first. With no winners, export the empty CSV.'
                    : 'Blocked: there are winners since the last export. Export the CSV again first.',
                tone: Tone.warning,
                icon: Icons.block,
              )
            else
              TextField(
                key: const Key('close-confirm-field'),
                controller: _typed,
                autofocus: true,
                decoration: const InputDecoration(labelText: 'Type CLOSE EVENT to confirm'),
                onChanged: (_) => setState(() {}),
              ),
          ],
        ),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
        FilledButton(
          key: const Key('close-confirm'),
          style: FilledButton.styleFrom(backgroundColor: c.dangerBorder, foregroundColor: c.dangerBg, minimumSize: const Size(0, 44)),
          onPressed: csvOk && match ? () => Navigator.pop(context, true) : null,
          child: const Text('Close and delete'),
        ),
      ],
    );
  }
}
