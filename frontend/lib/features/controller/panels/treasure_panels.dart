import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:material_ui/material_ui.dart';

import '../../../core/widgets/widgets.dart';
import '../controller_api.dart';
import '../controller_state.dart';
import '../widgets/common.dart';
import 'setup_panels.dart';

// ---------------------------------------------------------------- Treasure review

/// Human approval gate for the treasure (FE-13).
class TreasurePanel extends ConsumerStatefulWidget {
  const TreasurePanel({super.key, required this.state});
  final ControllerState state;

  @override
  ConsumerState<TreasurePanel> createState() => _TreasurePanelState();
}

class _TreasurePanelState extends ConsumerState<TreasurePanel> {
  bool _busy = false;
  bool _imageReady = false;
  String? _imageFor;

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

  @override
  Widget build(BuildContext context) {
    final t = widget.state.treasure;
    final notifier = ref.read(controllerProvider.notifier);
    if (t?.candidateId != _imageFor) {
      _imageFor = t?.candidateId;
      _imageReady = false;
    }

    final Widget body;
    if (t == null || t.generating) {
      body = _Generating(key: ValueKey(t?.candidateId));
    } else if (t.failed) {
      body = _Failed(treasure: t, busy: _busy, onRetry: () => _run(notifier.generateTreasure));
    } else {
      body = Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        spacing: 14,
        children: [
          Align(
            alignment: Alignment.centerLeft,
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 520),
              child: TreasureImage(
                key: ValueKey(t.imageUrl),
                url: t.imageUrl,
                onLoaded: () {
                  if (mounted && !_imageReady) setState(() => _imageReady = true);
                },
              ),
            ),
          ),
          _TreasureCard(treasure: t),
          _Rubric(criteria: t.rubric),
          Wrap(
            spacing: 12,
            runSpacing: 12,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              FilledButton.icon(
                key: const Key('approve-treasure'),
                onPressed: _imageReady && !_busy ? () => _run(notifier.approveTreasure) : null,
                icon: const Icon(Icons.check),
                label: const Text('Approve'),
              ),
              OutlinedButton.icon(
                onPressed: _busy ? null : () => _run(notifier.rejectTreasure),
                icon: const Icon(Icons.refresh),
                label: const Text('Reject and regenerate'),
              ),
              if (!_imageReady) const ReasonLine('Approve unlocks once the image has loaded.', tone: Tone.neutral),
            ],
          ),
        ],
      );
    }

    return HeistCard(
      title: 'Review the treasure',
      subtitle: 'Nobody sees it until you approve it and start the round.',
      trailing: const AbandonButton(),
      child: body,
    );
  }
}

/// Generation takes up to 40 seconds, so the wait shows elapsed time and the
/// stage it is probably in, and never looks frozen (FE-13, designed by dev).
class _Generating extends StatefulWidget {
  const _Generating({super.key});

  @override
  State<_Generating> createState() => _GeneratingState();
}

class _GeneratingState extends State<_Generating> {
  final _watch = Stopwatch()..start();
  late final Timer _tick;

  @override
  void initState() {
    super.initState();
    _tick = Timer.periodic(const Duration(milliseconds: 500), (_) => setState(() {}));
  }

  @override
  void dispose() {
    _tick.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final c = context.hc;
    final secs = _watch.elapsed.inSeconds;
    final step = secs < 12 ? 0 : (secs < 20 ? 1 : 2);
    const steps = ['Writing the story and the rubric', 'Running the content filter', 'Painting the treasure image'];
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(color: c.warningBg, borderRadius: BorderRadius.circular(16)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        spacing: 14,
        children: [
          Row(
            spacing: 14,
            children: [
              SizedBox.square(dimension: 22, child: CircularProgressIndicator(strokeWidth: 2.5, color: c.warningText)),
              Expanded(
                child: Text(
                  'The Treasure Generator is drafting a candidate',
                  style: TextStyle(fontSize: 16, fontWeight: FontWeight.w500, color: c.text),
                ),
              ),
              Text('${secs}s', style: context.mono(TextStyle(fontSize: 18, color: c.warningText))),
            ],
          ),
          ClipRRect(
            borderRadius: BorderRadius.circular(99),
            child: LinearProgressIndicator(
              minHeight: 6,
              value: (secs / 40).clamp(0.05, 0.95),
              color: c.warningText,
              backgroundColor: c.surface,
            ),
          ),
          for (var i = 0; i < steps.length; i++)
            Row(
              spacing: 10,
              children: [
                Icon(
                  i < step ? Icons.check_circle : (i == step ? Icons.radio_button_checked : Icons.radio_button_unchecked),
                  size: 18,
                  color: i <= step ? c.warningText : c.textMuted,
                ),
                Text(steps[i], style: TextStyle(color: i <= step ? c.text : c.textMuted)),
              ],
            ),
          Text(
            secs > 45
                ? 'Taking longer than usual. It will fail and offer a retry if something is wrong.'
                : 'This usually takes 20 to 40 seconds. A safety check runs before you see it.',
            style: TextStyle(fontSize: 12, color: c.textSecondary),
          ),
        ],
      ),
    );
  }
}

class _Failed extends StatelessWidget {
  const _Failed({required this.treasure, required this.busy, required this.onRetry});
  final CtlTreasure treasure;
  final bool busy;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final c = context.hc;
    final stage = switch (treasure.failedStage) {
      'TEXT' => 'while writing the story',
      'FILTER' => 'at the content filter',
      'IMAGE' => 'while painting the image',
      _ => '',
    };
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(color: c.dangerBg, borderRadius: BorderRadius.circular(16)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        spacing: 12,
        children: [
          Row(
            spacing: 10,
            children: [
              Icon(Icons.error_outline, color: c.dangerText),
              Expanded(
                child: Text(
                  'Treasure generation failed $stage'.trim(),
                  style: TextStyle(fontSize: 16, fontWeight: FontWeight.w500, color: c.text),
                ),
              ),
            ],
          ),
          Text(
            'Nothing was shown to players. Try again; if it keeps failing, check agent health.',
            style: TextStyle(color: c.textSecondary),
          ),
          FilledButton.icon(
            key: const Key('retry-treasure'),
            onPressed: busy || !treasure.retryable ? null : onRetry,
            icon: busy ? const ButtonSpinner() : const Icon(Icons.refresh),
            label: const Text('Retry'),
          ),
        ],
      ),
    );
  }
}

/// The generated treasure image in a 16:9 frame. Calls [onLoaded] once the
/// image has decoded, so Approve can unlock (FE-13).
class TreasureImage extends StatefulWidget {
  const TreasureImage({super.key, required this.url, this.onLoaded, this.radius = 16});
  final String url;
  final VoidCallback? onLoaded;
  final double radius;

  @override
  State<TreasureImage> createState() => _TreasureImageState();
}

class _TreasureImageState extends State<TreasureImage> {
  ImageStream? _stream;
  late final ImageStreamListener _listener = ImageStreamListener(
    (_, _) {
      if (mounted) setState(() => _status = 1);
      widget.onLoaded?.call();
    },
    onError: (_, _) {
      if (mounted) setState(() => _status = -1);
    },
  );

  /// 0 loading, 1 loaded, -1 failed.
  int _status = 0;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_stream == null && widget.url.isNotEmpty) {
      _stream = NetworkImage(widget.url).resolve(createLocalImageConfiguration(context))..addListener(_listener);
    } else if (widget.url.isEmpty) {
      _status = -1;
    }
  }

  @override
  void dispose() {
    _stream?.removeListener(_listener);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final c = context.hc;
    return ClipRRect(
      borderRadius: BorderRadius.circular(widget.radius),
      child: AspectRatio(
        aspectRatio: 16 / 9,
        child: switch (_status) {
          1 => Image.network(widget.url, fit: BoxFit.cover),
          -1 => ColoredBox(
            color: c.card,
            child: Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                spacing: 8,
                children: [
                  Icon(Icons.broken_image_outlined, size: 36, color: c.textMuted),
                  Text('The image did not load. Reject and regenerate.', style: TextStyle(color: c.textSecondary)),
                ],
              ),
            ),
          ),
          _ => ColoredBox(
            color: c.card,
            child: Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                spacing: 10,
                children: [
                  const CircularProgressIndicator(strokeWidth: 2.5),
                  Text('Loading image…', style: TextStyle(color: c.textSecondary)),
                ],
              ),
            ),
          ),
        },
      ),
    );
  }
}

class _TreasureCard extends StatelessWidget {
  const _TreasureCard({required this.treasure});
  final CtlTreasure treasure;

  @override
  Widget build(BuildContext context) {
    final c = context.hc;
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(color: c.warningBg, borderRadius: BorderRadius.circular(16)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        spacing: 8,
        children: [
          Row(
            spacing: 8,
            children: [
              Icon(Icons.diamond_outlined, color: c.warningText),
              Expanded(child: Text(treasure.title, style: TextStyle(fontSize: 20, fontWeight: FontWeight.w500, color: c.text))),
              if (treasure.filterPassed)
                const StatusChip('Passed content filter', tone: Tone.success, icon: Icons.verified_outlined),
            ],
          ),
          Text(treasure.backstory, style: TextStyle(color: c.text, height: 1.5)),
          Text.rich(
            TextSpan(children: [
              const TextSpan(text: 'Objective: ', style: TextStyle(fontWeight: FontWeight.w500)),
              TextSpan(text: treasure.lockObjective),
            ]),
            style: TextStyle(color: c.text),
          ),
        ],
      ),
    );
  }
}

class _Rubric extends StatelessWidget {
  const _Rubric({required this.criteria});
  final List<String> criteria;

  @override
  Widget build(BuildContext context) {
    final c = context.hc;
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(borderRadius: BorderRadius.circular(16), border: Border.all(color: c.borderStrong)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        spacing: 8,
        children: [
          Wrap(
            spacing: 8,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              Icon(Icons.visibility_off_outlined, size: 18, color: c.textSecondary),
              const Text('Hidden scoring rubric', style: TextStyle(fontWeight: FontWeight.w500)),
              Text('· never shown to players or the audience', style: TextStyle(fontSize: 12, color: c.textMuted)),
            ],
          ),
          Wrap(spacing: 8, runSpacing: 8, children: [for (final r in criteria) StatusChip(r, tone: Tone.neutral)]),
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------- Ready

/// Last check before the round (FE-14).
class ReadyPanel extends ConsumerStatefulWidget {
  const ReadyPanel({super.key, required this.state});
  final ControllerState state;

  @override
  ConsumerState<ReadyPanel> createState() => _ReadyPanelState();
}

class _ReadyPanelState extends ConsumerState<ReadyPanel> {
  bool _busy = false;
  bool _checking = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    // Fresh agent health every time this screen opens (cached 60s server-side).
    Future.microtask(_checkHealth);
  }

  Future<void> _checkHealth() async {
    if (!mounted) return;
    setState(() => _checking = true);
    await ref.read(controllerProvider.notifier).loadHealth();
    if (mounted) setState(() => _checking = false);
  }

  Future<void> _start() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref.read(controllerProvider.notifier).start();
    } catch (e) {
      if (mounted) setState(() => _error = controllerErrorText(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = widget.state;
    final c = context.hc;
    final blockers = s.startBlockers();
    final seconds = s.session?.roundDurationSeconds ?? defaultDuration;
    return HeistCard(
      title: 'Ready to start',
      subtitle: 'Starting reveals "${s.treasure?.title ?? ''}" on every phone and the big screen.',
      trailing: const AbandonButton(),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        spacing: 20,
        children: [
          Row(
            spacing: 10,
            children: [
              Icon(Icons.diamond_outlined, color: c.warningText),
              Expanded(
                child: Text(s.treasure?.title ?? '', style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w500)),
              ),
            ],
          ),
          RoundLength(state: s),
          _AgentStatus(health: s.health, checking: _checking, onCheck: _checkHealth),
          Wrap(
            spacing: 16,
            runSpacing: 12,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              SizedBox(
                height: 56,
                child: FilledButton.icon(
                  key: const Key('start-round'),
                  onPressed: blockers.isEmpty && !_busy ? _start : null,
                  style: FilledButton.styleFrom(
                    padding: const EdgeInsets.symmetric(horizontal: 28),
                    textStyle: const TextStyle(fontSize: 17, fontWeight: FontWeight.w500),
                  ),
                  icon: _busy ? const ButtonSpinner() : const Icon(Icons.play_arrow_rounded, size: 28),
                  label: Text('Start ${seconds}s round'),
                ),
              ),
            ],
          ),
          if (blockers.isNotEmpty)
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              spacing: 6,
              children: [for (final b in blockers) ReasonLine(b)],
            ),
          if (_error != null) ReasonLine(_error!, tone: Tone.danger, icon: Icons.error_outline),
        ],
      ),
    );
  }
}

/// Agent health on the Ready screen (FE-14, designed by dev). Names any
/// agent that is down.
class _AgentStatus extends StatelessWidget {
  const _AgentStatus({required this.health, required this.checking, required this.onCheck});
  final AgentHealth? health;
  final bool checking;
  final VoidCallback onCheck;

  @override
  Widget build(BuildContext context) {
    final c = context.hc;
    final h = health;
    final ok = h?.allHealthy ?? false;
    final tone = h == null ? Tone.neutral : (ok ? Tone.success : Tone.danger);
    final (bg, fg) = tone.colors(c);
    final text = h == null
        ? 'Checking the five AI agents…'
        : ok
            ? 'All five AI agents are up.'
            : '${h.down.map((a) => '${agentName(a)} agent').join(', ')} ${h.down.length == 1 ? 'is' : 'are'} down. '
                'Players cannot be scored, so the round cannot start.';
    return Container(
      padding: const EdgeInsets.fromLTRB(14, 10, 8, 10),
      decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(16)),
      child: Row(
        spacing: 10,
        children: [
          Icon(ok ? Icons.check_circle_outline : (h == null ? Icons.hourglass_empty : Icons.cloud_off_outlined), color: fg, size: 20),
          Expanded(child: Text(text, style: TextStyle(color: h == null ? c.textSecondary : fg))),
          TextButton(
            onPressed: checking ? null : onCheck,
            child: checking ? const ButtonSpinner() : const Text('Check again'),
          ),
        ],
      ),
    );
  }
}
