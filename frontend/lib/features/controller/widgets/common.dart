import 'package:material_ui/material_ui.dart';

import '../../../core/widgets/widgets.dart';

/// Phase chip text and colour for the header.
(String, Tone) phaseLabel(String phase) => switch (phase) {
  'SETUP' => ('Setup', Tone.neutral),
  'JOINING' => ('Joining', Tone.accent),
  'TREASURE_REVIEW' => ('Treasure review', Tone.warning),
  'READY' => ('Ready', Tone.accent),
  'PLAYING' => ('Playing', Tone.success),
  'RESULT_PENDING' => ('Result pending', Tone.warning),
  'RESULTS' => ('Results', Tone.success),
  'DISCARDED' => ('Discarded', Tone.neutral),
  'CLOSED' => ('Closed', Tone.neutral),
  _ => (phase, Tone.neutral),
};

/// Player status chip: the seven `slotState` values (FE-12).
(String, Tone) slotLabel(String slotState) => switch (slotState) {
  'UNJOINED' => ('Unjoined', Tone.neutral),
  'LOBBY' => ('Lobby', Tone.accent),
  'PLAYING' => ('Playing', Tone.accent),
  'LOCKED_100' => ('Locked 100', Tone.success),
  'DISCONNECTED' => ('Disconnected', Tone.warning),
  'RESULT_PENDING' => ('Result pending', Tone.warning),
  'COMPLETE' => ('Complete', Tone.neutral),
  _ => (slotState, Tone.neutral),
};

SlotShape shapeOf(String apiValue, int slotNumber) {
  try {
    return SlotShape.fromApi(apiValue);
  } catch (_) {
    return SlotShape.forSlot(slotNumber);
  }
}

String clockTime(DateTime? t) {
  if (t == null) return '--:--:--';
  final l = t.toLocal();
  String two(int n) => n.toString().padLeft(2, '0');
  return '${two(l.hour)}:${two(l.minute)}:${two(l.second)}';
}

String ordinal(int n) {
  if (n % 100 >= 11 && n % 100 <= 13) return '${n}th';
  return switch (n % 10) { 1 => '${n}st', 2 => '${n}nd', 3 => '${n}rd', _ => '${n}th' };
}

/// A small muted label above a control.
class FieldLabel extends StatelessWidget {
  const FieldLabel(this.text, {super.key});
  final String text;

  @override
  Widget build(BuildContext context) =>
      Text(text, style: TextStyle(fontSize: 12, color: context.hc.textSecondary));
}

/// One tinted stat tile on the live monitor.
class StatTile extends StatelessWidget {
  const StatTile({super.key, required this.label, required this.value, required this.tone});
  final String label;
  final int value;
  final Tone tone;

  @override
  Widget build(BuildContext context) {
    final c = context.hc;
    final (bg, fg) = tone.colors(c);
    return Container(
      width: 150,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(16)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        spacing: 2,
        children: [
          Text(label, style: TextStyle(fontSize: 12, color: fg)),
          Text('$value', style: context.mono(TextStyle(fontSize: 28, fontWeight: FontWeight.w500, color: c.text))),
        ],
      ),
    );
  }
}

/// A line of muted text with an icon, for reasons a button is disabled.
class ReasonLine extends StatelessWidget {
  const ReasonLine(this.text, {super.key, this.tone = Tone.warning, this.icon = Icons.info_outline});
  final String text;
  final Tone tone;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    final fg = tone.colors(context.hc).$2;
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      spacing: 8,
      children: [
        Padding(padding: const EdgeInsets.only(top: 2), child: Icon(icon, size: 16, color: fg)),
        Expanded(child: Text(text, style: TextStyle(color: fg))),
      ],
    );
  }
}

/// Spinner sized for a button.
class ButtonSpinner extends StatelessWidget {
  const ButtonSpinner({super.key, this.color});
  final Color? color;

  @override
  Widget build(BuildContext context) =>
      SizedBox.square(dimension: 18, child: CircularProgressIndicator(strokeWidth: 2, color: color));
}

/// Shows an error from an action as a snackbar.
void showActionError(BuildContext context, String message) {
  final c = context.hc;
  ScaffoldMessenger.maybeOf(context)?.showSnackBar(
    SnackBar(
      backgroundColor: c.dangerBg,
      behavior: SnackBarBehavior.floating,
      content: Text(message, style: TextStyle(color: c.dangerText)),
    ),
  );
}

/// Confirmation dialog with a required reason (abandon session, discard round).
///
/// Returns the trimmed reason, or null when cancelled.
Future<String?> askReason(
  BuildContext context, {
  required String title,
  required String message,
  required String confirmLabel,
  String hint = '',
}) => showDialog<String>(
  context: context,
  builder: (_) => _ReasonDialog(title: title, message: message, confirmLabel: confirmLabel, hint: hint),
);

class _ReasonDialog extends StatefulWidget {
  const _ReasonDialog({required this.title, required this.message, required this.confirmLabel, required this.hint});
  final String title;
  final String message;
  final String confirmLabel;
  final String hint;

  @override
  State<_ReasonDialog> createState() => _ReasonDialogState();
}

class _ReasonDialogState extends State<_ReasonDialog> {
  final _reason = TextEditingController();
  String? _error;

  @override
  void dispose() {
    _reason.dispose();
    super.dispose();
  }

  void _submit() {
    final r = _reason.text.trim();
    if (r.isEmpty) {
      setState(() => _error = 'Enter a reason. It goes in the audit log.');
      return;
    }
    Navigator.pop(context, r);
  }

  @override
  Widget build(BuildContext context) {
    final c = context.hc;
    return AlertDialog(
      icon: Icon(Icons.warning_amber_rounded, color: c.dangerText),
      title: Text(widget.title),
      content: SizedBox(
        width: 440,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          spacing: 16,
          children: [
            Text(widget.message, style: TextStyle(color: c.textSecondary, height: 1.5)),
            TextField(
              controller: _reason,
              autofocus: true,
              maxLines: 2,
              decoration: InputDecoration(labelText: 'Reason (required)', hintText: widget.hint, errorText: _error),
              onChanged: (_) => setState(() => _error = null),
            ),
          ],
        ),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancel')),
        FilledButton(
          style: FilledButton.styleFrom(backgroundColor: c.dangerBorder, foregroundColor: c.dangerBg, minimumSize: const Size(0, 44)),
          onPressed: _submit,
          child: Text(widget.confirmLabel),
        ),
      ],
    );
  }
}
