import 'package:material_ui/material_ui.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/api/api_error.dart';
import '../../../core/api/player_api.dart';
import '../../../core/api/token_store.dart';
import '../../../core/storage/player_session.dart';
import '../../../core/widgets/widgets.dart';
import '../widgets/player_ui.dart';
import 'join_state.dart';

class NameIdPage extends ConsumerStatefulWidget {
  const NameIdPage({super.key});

  @override
  ConsumerState<NameIdPage> createState() => _NameIdPageState();
}

class _NameIdPageState extends ConsumerState<NameIdPage> {
  final _name = TextEditingController();
  final _id = TextEditingController();
  final _idFocus = FocusNode();
  bool _busy = false;
  bool _mustRestart = false;
  String? _nameError, _idError, _generalError;

  @override
  void initState() {
    super.initState();

    // The join token lives in memory only. After a refresh it is gone.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted && ref.read(joinSessionProvider) == null) {
        context.go('/player');
      }
    });
  }

  @override
  void dispose() {
    _name.dispose();
    _id.dispose();
    _idFocus.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final name = _name.text.trim();
    final id = _id.text.trim();

    setState(() {
      _nameError = name.isEmpty ? 'Please enter your name.' : null;
      _idError = id.isEmpty ? 'Please enter your entrance ID.' : null;
      _generalError = null;
    });

    if (name.isEmpty || id.isEmpty || _busy) return;

    final join = ref.read(joinSessionProvider);

    if (join == null) {
      context.go('/player');
      return;
    }

    setState(() => _busy = true);

    try {
      final r = await ref
          .read(playerApiProvider)
          .join(joinToken: join.joinToken, fullName: name, entranceId: id);

      final token = r['playerToken'] as String;
      savePlayerToken(token);
      ref.read(tokenProvider.notifier).set(token);
      ref.read(joinSessionProvider.notifier).clear();

      if (!mounted) return;
      context.go('/player/lobby');
    } catch (e) {
      if (!mounted) return;
      _showError(e);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _showError(Object e) {
    setState(() {
      if (e is! ApiException) {
        _generalError = 'Something went wrong. Please try again.';
        return;
      }

      switch (e.code) {
        case 'NAME_REQUIRED':
          _nameError = 'Please enter your name.';
        case 'ENTRANCE_ID_REQUIRED':
          _idError = 'Please enter your entrance ID.';
        case 'ENTRANCE_ID_IN_SESSION':
          _idError =
              'This entrance ID is already in this game. '
              'If that is you, go back and use "Rejoin a game".';
        case 'ENTRANCE_ID_USED':
          _idError = 'This entrance ID has already played.';
        case 'CODE_ALREADY_CLAIMED':
          _generalError =
              'That spot was just taken. Enter your booth code again.';
          _mustRestart = true;
        case 'JOIN_TOKEN_EXPIRED':
          _generalError = 'Your code expired. Enter your booth code again.';
          _mustRestart = true;
        case 'NETWORK_ERROR':
          _generalError =
              'Cannot reach the server. Check your connection and try again.';
        default:
          _generalError = e.message;
      }
    });
  }

  void _restart() {
    ref.read(joinSessionProvider.notifier).clear();
    context.go('/player');
  }

  @override
  Widget build(BuildContext context) {
    final c = context.hc;
    final join = ref.watch(joinSessionProvider);
    return PlayerPage(
      top: PlayerTopBar(
        onBack: _restart,
        trailing: const StepDots(current: 2, total: 2),
      ),
      content: [
        PageTitle(
          'What should we call you?',
          subtitle: join == null
              ? null
              : 'Booth slot ${join.slotNumber} of ${join.capacity}',
        ),
        LabelledField(
          label: 'Full name',
          field: TextField(
            key: const Key('nameField'),
            controller: _name,
            textInputAction: TextInputAction.next,
            textCapitalization: TextCapitalization.words,
            inputFormatters: [LengthLimitingTextInputFormatter(80)],
            decoration: InputDecoration(
              hintText: 'Aman Sharma',
              errorText: _nameError,
            ),
            onChanged: (_) => setState(() => _nameError = null),
            onSubmitted: (_) => _idFocus.requestFocus(),
          ),
        ),
        LabelledField(
          label: 'Entrance ID',
          field: TextField(
            key: const Key('idField'),
            controller: _id,
            focusNode: _idFocus,
            autocorrect: false,
            enableSuggestions: false,
            textInputAction: TextInputAction.done,
            inputFormatters: [LengthLimitingTextInputFormatter(128)],
            style: context.mono(TextStyle(fontSize: 16, color: c.text)),
            decoration: InputDecoration(
              hintText: 'From your entrance badge',
              hintStyle: TextStyle(fontFamily: HeistFonts.sans, color: c.textMuted),
              errorText: _idError,
            ),
            onChanged: (_) => setState(() => _idError = null),
            onSubmitted: (_) => _submit(),
          ),
        ),
        if (_generalError != null)
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
                Expanded(
                  child: Text(_generalError!, key: const Key('joinError')),
                ),
              ],
            ),
          )
        else
          const InfoCard(
            tone: Tone.accent,
            child: IconLine(
              Icons.visibility_off_outlined,
              'Only your first name shows on the big screen. Your details '
              'are used just for today.',
            ),
          ),
      ],
      bottom: [
        PrimaryButton(
          label: _mustRestart ? 'Enter code again' : 'Enter lobby',
          busy: _busy,
          onPressed: _mustRestart ? _restart : _submit,
        ),
      ],
    );
  }
}
