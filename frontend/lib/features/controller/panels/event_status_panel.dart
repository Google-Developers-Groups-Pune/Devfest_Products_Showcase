import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:material_ui/material_ui.dart';

import '../../../core/widgets/widgets.dart';
import '../controller_api.dart';
import '../controller_state.dart';
import '../widgets/common.dart';

/// Closing, Closed and Closing failed (FE-17, designed by dev). Replaces the
/// main panel once the day is being closed.
class EventStatusPanel extends ConsumerStatefulWidget {
  const EventStatusPanel({super.key, required this.state});
  final ControllerState state;

  @override
  ConsumerState<EventStatusPanel> createState() => _EventStatusPanelState();
}

class _EventStatusPanelState extends ConsumerState<EventStatusPanel> {
  bool _busy = false;

  Future<void> _retry() async {
    setState(() => _busy = true);
    try {
      await ref.read(controllerProvider.notifier).closeEvent();
    } catch (e) {
      if (mounted) showActionError(context, controllerErrorText(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.hc;
    final ev = widget.state.eventDay;
    final f = ev.failure;
    return HeistCard(
      title: 'Event day',
      subtitle: 'Closing deletes all of today\'s data.',
      child: switch (ev.status) {
        'CLOSING' => _StatusBox(
          tone: Tone.warning,
          leading: SizedBox.square(dimension: 22, child: CircularProgressIndicator(strokeWidth: 2.5, color: c.warningText)),
          title: 'Closing the event day…',
          body: 'Deleting names, entrance IDs, prompts, scores, treasures, winners and audit records. Keep this page open.',
        ),
        'CLOSED' => const _StatusBox(
          tone: Tone.success,
          leading: Icon(Icons.verified_outlined),
          title: 'Event day closed',
          body: 'Deletion complete. Names, entrance IDs, prompts, scores, treasures, winners and audit records are gone. '
              'No more sessions can be opened today.',
        ),
        _ => _StatusBox(
          tone: Tone.danger,
          leading: const Icon(Icons.error_outline),
          title: 'Closing failed',
          body: [
            'Deletion stopped at the ${'${f?['stage'] ?? 'unknown'}'.toLowerCase()} stage',
            if (f?['code'] != null) ' (${f!['code']})',
            if (f?['remaining'] != null) ', with ${f!['remaining']} items left',
            '. Retry; if it fails again, escalate through the operations procedure.',
          ].join(),
          action: FilledButton.icon(
            key: const Key('retry-close'),
            onPressed: _busy ? null : _retry,
            icon: _busy ? const ButtonSpinner() : const Icon(Icons.refresh),
            label: const Text('Retry deletion'),
          ),
        ),
      },
    );
  }
}

class _StatusBox extends StatelessWidget {
  const _StatusBox({required this.tone, required this.leading, required this.title, required this.body, this.action});
  final Tone tone;
  final Widget leading;
  final String title;
  final String body;
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    final c = context.hc;
    final (bg, fg) = tone.colors(c);
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(16)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        spacing: 12,
        children: [
          Row(
            spacing: 12,
            children: [
              IconTheme.merge(data: IconThemeData(color: fg, size: 24), child: leading),
              Expanded(child: Text(title, style: TextStyle(fontSize: 18, fontWeight: FontWeight.w500, color: c.text))),
            ],
          ),
          Text(body, style: TextStyle(color: fg, height: 1.5)),
          ?action,
        ],
      ),
    );
  }
}
