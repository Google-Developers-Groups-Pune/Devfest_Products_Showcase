import 'package:material_ui/material_ui.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/api/api_error.dart';
import '../../../core/api/player_api.dart';
import '../../../core/api/token_store.dart';
import '../../../core/storage/player_session.dart';
import '../player_routes.dart';
import '../../../core/widgets/widgets.dart';
import '../widgets/player_ui.dart';
import 'join_state.dart';

String rejoinErrorText(Object e) {
  if (e is ApiException) {
    switch (e.code) {
      case 'NO_ACTIVE_GAME':
        return 'We could not find an active game for that entrance ID. '
            'Check it and try again.';
      case 'TOO_MANY_ATTEMPTS':
        return 'Too many tries. Wait a minute, then try again.';
      case 'NETWORK_ERROR':
        return 'Cannot reach the server. Check your connection and try again.';
      default:
        return e.message;
    }
  }
  return 'Something went wrong. Please try again.';
}

class RejoinPage extends ConsumerStatefulWidget {
  const RejoinPage({super.key});

  @override
  ConsumerState<RejoinPage> createState() => _RejoinPageState();
}

class _RejoinPageState extends ConsumerState<RejoinPage> {
  final _id = TextEditingController();
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _id.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final id = _id.text.trim();
    if (id.isEmpty) {
      setState(() => _error = 'Please enter your entrance ID.');
      return;
    }
    if (_busy) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final r = await ref.read(playerApiProvider).rejoin(id);
      final token = r['playerToken'] as String;
      final player = Map<String, dynamic>.from(r['player'] as Map);
      savePlayerToken(token);
      ref.read(joinSessionProvider.notifier).clear();
      ref.read(tokenProvider.notifier).set(token);
      if (!mounted) return;
      context.go(routeForPlayerState('${player['state']}'));
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = rejoinErrorText(e)); // stay here, allow retries
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.hc;
    return PlayerPage(
      top: PlayerTopBar(onBack: () => context.go('/player')),
      content: [
        const PageTitle(
          'Welcome back',
          subtitle:
              'Lost connection or switched phones? Enter the entrance ID you joined with.',
        ),
        LabelledField(
          label: 'Entrance ID',
          field: TextField(
            key: const Key('rejoinIdField'),
            controller: _id,
            autofocus: true,
            autocorrect: false,
            enableSuggestions: false,
            textInputAction: TextInputAction.done,
            inputFormatters: [LengthLimitingTextInputFormatter(128)],
            style: context.mono(TextStyle(fontSize: 16, color: c.text)),
            decoration: InputDecoration(
              hintText: 'From your entrance badge',
              hintStyle: TextStyle(fontFamily: HeistFonts.sans, color: c.textMuted),
            ),
            onChanged: (_) => setState(() => _error = null),
            onSubmitted: (_) => _submit(),
          ),
        ),
        if (_error != null)
          InfoCard(
            tone: Tone.danger,
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              spacing: 8,
              children: [
                const Padding(
                  padding: EdgeInsets.only(top: 1),
                  child: Icon(Icons.error_outline),
                ),
                Expanded(child: Text(_error!, key: const Key('rejoinError'))),
              ],
            ),
          )
        else
          const InfoCard(
            tone: Tone.accent,
            child: IconLine(
              Icons.devices_outlined,
              'Any other device playing as you will be signed out.',
            ),
          ),
      ],
      bottom: [
        PrimaryButton(label: 'Rejoin', busy: _busy, onPressed: _submit),
      ],
    );
  }
}
