import 'dart:async';

import 'package:material_ui/material_ui.dart';

import '../../../core/widgets/widgets.dart';
import '../controller_state.dart';
import '../widgets/common.dart';

/// Watch the round (FE-15). Approved prompts only; blocked ones are a count,
/// never text. A refresh rebuilds this from the hydrate and monitor calls.
class LivePanel extends StatefulWidget {
  const LivePanel({super.key, required this.state});
  final ControllerState state;

  @override
  State<LivePanel> createState() => _LivePanelState();
}

class _LivePanelState extends State<LivePanel> {
  late final Timer _tick;

  @override
  void initState() {
    super.initState();
    _tick = Timer.periodic(const Duration(milliseconds: 250), (_) => setState(() {}));
  }

  @override
  void dispose() {
    _tick.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final s = widget.state;
    final c = context.hc;
    final st = s.stats;
    return HeistCard(
      title: s.treasure?.title ?? 'Live round',
      subtitle: 'Round ${s.round?.roundNumber ?? ''} · server timer is authoritative',
      trailing: TimerPill(remaining: s.remaining(ControllerNotifier.now())),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        spacing: 16,
        children: [
          Wrap(
            spacing: 12,
            runSpacing: 12,
            children: [
              StatTile(label: 'Prompts scored', value: st.promptsScored, tone: Tone.accent),
              StatTile(label: 'Unlocked at 100', value: st.unlockedCount, tone: Tone.success),
              StatTile(label: 'Blocked by filter', value: st.blockedCount, tone: Tone.danger),
              StatTile(label: 'Agent errors', value: st.agentErrors, tone: Tone.warning),
            ],
          ),
          Text('Approved prompts', style: TextStyle(fontWeight: FontWeight.w500, color: c.textSecondary)),
          if (s.feed.isEmpty)
            Text('Waiting for the first scored prompt…', style: TextStyle(color: c.textMuted))
          else
            for (final f in s.feed) FeedRow(item: f),
        ],
      ),
    );
  }
}

class FeedRow extends StatelessWidget {
  const FeedRow({super.key, required this.item});
  final FeedItem item;

  @override
  Widget build(BuildContext context) {
    final c = context.hc;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 2),
      child: Row(
        spacing: 12,
        children: [
          ScoreChip(item.score),
          ShapeAvatar(shapeOf(item.shape, item.slotNumber), size: 18),
          SizedBox(
            width: 90,
            child: Text(item.label, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w500)),
          ),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(item.text, maxLines: 2, overflow: TextOverflow.ellipsis),
                if (item.reaction != null)
                  Text(item.reaction!, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 12, color: c.textSecondary)),
              ],
            ),
          ),
          Text('#${item.sequence}', style: context.mono(TextStyle(fontSize: 12, color: c.textMuted))),
        ],
      ),
    );
  }
}
