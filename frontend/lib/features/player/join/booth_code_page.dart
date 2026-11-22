import 'package:material_ui/material_ui.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/api/api_error.dart';
import '../../../core/api/player_api.dart';
import 'join_state.dart';
import '../../../core/api/token_store.dart';
import '../../../core/storage/player_session.dart';
import '../../../core/widgets/widgets.dart';
import '../widgets/player_ui.dart';

String boothErrorText(Object e) {
  if (e is ApiException) {
    switch (e.code) {
      case 'CODE_INVALID':
        return 'That code is not right. Check the number at the booth and try again.';
      case 'CODE_ALREADY_CLAIMED':
        return 'That code is already taken. Ask the booth team for yours.';
      case 'NO_ACTIVE_SESSION':
        return 'No game is open right now. Please wait for the booth team.';
      case 'NETWORK_ERROR':
        return 'Cannot reach the server. Check your connection and try again.';
      default:
        return e.message;
    }
  }
  return 'Something went wrong. Please try again.';
}

class BoothCodePage extends ConsumerStatefulWidget {
  const BoothCodePage({super.key});

  @override
  ConsumerState<BoothCodePage> createState() => _BoothCodePageState();
}

class _BoothCodePageState extends ConsumerState<BoothCodePage> {
  final _c1 = TextEditingController();
  final _c2 = TextEditingController();
  final _f1 = FocusNode();
  final _f2 = FocusNode();
  bool _busy = false;
  String? _error;

  String get _code => _c1.text + _c2.text;
  bool get _ready => _code.length == 2 && !_busy;

  @override
  void initState() {
    super.initState();

    // A saved token means this tab already joined. Go straight back.
    final saved = loadPlayerToken();

    if (saved != null) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!mounted) return;
        ref.read(tokenProvider.notifier).set(saved);
        context.go('/player/lobby');
      });
    }
  }

  @override
  void dispose() {
    _c1.dispose();
    _c2.dispose();
    _f1.dispose();
    _f2.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_ready) return;

    setState(() {
      _busy = true;
      _error = null;
    });

    try {
      final r = await ref.read(playerApiProvider).joinCode(_code);
      ref.read(joinSessionProvider.notifier).set(JoinSession.fromJson(r));

      if (!mounted) return;
      context.go('/player/join');
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = boothErrorText(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Widget _box(
    Key key,
    TextEditingController c,
    FocusNode f, {
    ValueChanged<String>? onSubmitted,
    required ValueChanged<String> onChanged,
  }) {
    final hc = context.hc;
    OutlineInputBorder border(Color color, double width) => OutlineInputBorder(
      borderRadius: BorderRadius.circular(16),
      borderSide: BorderSide(color: color, width: width),
    );
    final hasError = _error != null;
    return SizedBox(
      width: 64,
      child: TextField(
        key: key,
        controller: c,
        focusNode: f,
        autofocus: key == const Key('code0'),
        textAlign: TextAlign.center,
        keyboardType: TextInputType.number,
        inputFormatters: [
          FilteringTextInputFormatter.digitsOnly,
          LengthLimitingTextInputFormatter(1),
        ],
        style: context.mono(
          TextStyle(fontSize: 32, fontWeight: FontWeight.w500, color: hc.text),
        ),
        decoration: InputDecoration(
          counterText: '',
          contentPadding: const EdgeInsets.symmetric(vertical: 16),
          enabledBorder: border(hasError ? hc.dangerBorder : hc.borderStrong, hasError ? 2 : 1),
          focusedBorder: border(hasError ? hc.dangerBorder : hc.accent, 2),
        ),
        onChanged: onChanged,
        onSubmitted: onSubmitted,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final c = context.hc;
    return Scaffold(
      body: SafeArea(
        child: Column(
          children: [
            Expanded(
              child: SingleChildScrollView(
                child: Column(
                  children: [
                    const HeroBanner(
                      color: heroBlue,
                      padding: EdgeInsets.fromLTRB(20, 56, 20, 84),
                      child: Column(
                        spacing: 6,
                        children: [
                          Text(
                            'Prompt Heist',
                            style: TextStyle(fontSize: 34, fontWeight: FontWeight.w500),
                          ),
                          Text('DevFest Pune 2026', style: TextStyle(fontSize: 14)),
                        ],
                      ),
                    ),
                    // The card overlaps the banner.
                    Transform.translate(
                      offset: const Offset(0, -44),
                      child: Center(
                        child: ConstrainedBox(
                          constraints: const BoxConstraints(maxWidth: 420),
                          child: Padding(
                            padding: const EdgeInsets.symmetric(horizontal: 20),
                            child: _card(c),
                          ),
                        ),
                      ),
                    ),
                    Transform.translate(
                      offset: const Offset(0, -28),
                      child: Text(
                        'Write the prompt that cracks the vault',
                        style: TextStyle(color: c.textSecondary),
                      ),
                    ),
                  ],
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 0, 20, 12),
              child: TextButton(
                onPressed: () => context.go('/player/rejoin'),
                style: TextButton.styleFrom(
                  foregroundColor: c.accent,
                  minimumSize: const Size(0, 44),
                  textStyle: const TextStyle(fontSize: 15, fontWeight: FontWeight.w500, fontFamily: HeistFonts.sans),
                ),
                child: const Text('Rejoin a game'),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _card(HeistColors c) => Container(
    padding: const EdgeInsets.fromLTRB(20, 18, 20, 20),
    decoration: BoxDecoration(
      color: c.surface,
      borderRadius: BorderRadius.circular(24),
      border: Border.all(color: c.border),
    ),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      spacing: 12,
      children: [
        Text(
          'Booth code',
          textAlign: TextAlign.center,
          style: TextStyle(color: c.text, fontSize: 16, fontWeight: FontWeight.w500),
        ),
        Text(
          'Two digits, from the booth screen.',
          textAlign: TextAlign.center,
          style: TextStyle(color: c.textSecondary, fontSize: 13),
        ),
        Row(
          mainAxisAlignment: MainAxisAlignment.center,
          spacing: 12,
          children: [
            _box(
              const Key('code0'),
              _c1,
              _f1,
              onChanged: (v) {
                setState(() => _error = null);
                if (v.isNotEmpty) _f2.requestFocus();
              },
            ),
            _box(
              const Key('code1'),
              _c2,
              _f2,
              onSubmitted: (_) => _submit(),
              onChanged: (v) {
                setState(() => _error = null);
                if (v.isEmpty) _f1.requestFocus();
              },
            ),
          ],
        ),
        if (_error != null)
          Text(
            _error!,
            key: const Key('boothError'),
            textAlign: TextAlign.center,
            style: TextStyle(color: c.dangerText, fontSize: 13, height: 1.4),
          ),
        PrimaryButton(label: 'Join', busy: _busy, onPressed: _ready ? _submit : null),
      ],
    ),
  );
}
