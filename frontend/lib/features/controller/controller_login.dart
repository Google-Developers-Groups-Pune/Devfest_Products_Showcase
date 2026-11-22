import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:material_ui/material_ui.dart';

import '../../app/env.dart';
import '../../core/api/api_error.dart';
import '../../core/mock/mock_controller.dart';
import '../../core/widgets/widgets.dart';
import 'controller_auth.dart';
import 'widgets/common.dart';

/// Controller sign-in card (FE-11). Username, not email, as the account is
/// a single shared booth login.
class ControllerLogin extends ConsumerStatefulWidget {
  const ControllerLogin({super.key});

  @override
  ConsumerState<ControllerLogin> createState() => _ControllerLoginState();
}

class _ControllerLoginState extends ConsumerState<ControllerLogin> {
  final _username = TextEditingController();
  final _password = TextEditingController();
  String? _usernameError;
  String? _passwordError;
  String? _formError;
  bool _busy = false;

  @override
  void dispose() {
    _username.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _signIn() async {
    final username = _username.text.trim();
    setState(() {
      _usernameError = username.isEmpty ? 'Enter the Controller username.' : null;
      _passwordError = _password.text.isEmpty ? 'Enter the password.' : null;
      _formError = null;
    });
    if (_usernameError != null || _passwordError != null) return;
    setState(() => _busy = true);
    try {
      await ref.read(controllerAuthProvider.notifier).login(username, _password.text);
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _formError = switch (e.code) {
          'INVALID_CREDENTIALS' => 'Wrong username or password.',
          'TOO_MANY_ATTEMPTS' => 'Too many attempts. Wait a minute, then try again.',
          'NETWORK_ERROR' => 'Cannot reach the server. Check the connection.',
          _ => e.message,
        };
        _password.clear();
      });
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.hc;
    final reason = ref.watch(controllerAuthProvider.select((a) => a.reason));
    return Scaffold(
      body: Column(
        children: [
          const TopStripe(),
          Expanded(
            child: Center(
              child: SingleChildScrollView(
                padding: const EdgeInsets.all(24),
                child: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 420),
                  child: Container(
                    padding: const EdgeInsets.all(28),
                    decoration: BoxDecoration(
                      color: c.surface,
                      borderRadius: BorderRadius.circular(28),
                      border: Border.all(color: c.border),
                    ),
                    child: AutofillGroup(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        spacing: 16,
                        children: [
                          const Align(alignment: Alignment.centerLeft, child: StripeDots(size: 12)),
                          Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            spacing: 4,
                            children: [
                              const Text('Prompt Heist Controller', style: TextStyle(fontSize: 26, fontWeight: FontWeight.w500)),
                              Text('Sign in to run the booth', style: TextStyle(color: c.textSecondary)),
                            ],
                          ),
                          if (reason == SignOutReason.expired)
                            const ReasonLine('Your sign-in expired. Please sign in again.', icon: Icons.lock_clock_outlined),
                          Column(
                            crossAxisAlignment: CrossAxisAlignment.stretch,
                            spacing: 4,
                            children: [
                              const FieldLabel('Username'),
                              TextField(
                                key: const Key('login-username'),
                                controller: _username,
                                autofocus: true,
                                autofillHints: const [AutofillHints.username],
                                textInputAction: TextInputAction.next,
                                decoration: InputDecoration(errorText: _usernameError),
                                onChanged: (_) => setState(() => _usernameError = null),
                              ),
                            ],
                          ),
                          Column(
                            crossAxisAlignment: CrossAxisAlignment.stretch,
                            spacing: 4,
                            children: [
                              const FieldLabel('Password'),
                              TextField(
                                key: const Key('login-password'),
                                controller: _password,
                                obscureText: true,
                                autofillHints: const [AutofillHints.password],
                                decoration: InputDecoration(errorText: _passwordError),
                                onChanged: (_) => setState(() => _passwordError = null),
                                onSubmitted: (_) => _signIn(),
                              ),
                            ],
                          ),
                          if (_formError != null) ReasonLine(_formError!, tone: Tone.danger, icon: Icons.error_outline),
                          FilledButton(
                            onPressed: _busy ? null : _signIn,
                            child: _busy ? ButtonSpinner(color: c.onAccent) : const Text('Sign in'),
                          ),
                          if (Env.isMock)
                            Text(
                              'Mock backend: ${MockController.username} / ${MockController.password}',
                              textAlign: TextAlign.center,
                              style: TextStyle(fontSize: 12, color: c.textMuted),
                            ),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// Shown after `controller:kicked` (FE-11, designed by dev): this account
/// signed in on another laptop, so this one stops.
class SignedInElsewhere extends ConsumerWidget {
  const SignedInElsewhere({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return MessageScreen(
      icon: Icons.devices_other_outlined,
      tone: Tone.warning,
      title: 'Signed in on another device',
      message:
          'The Controller account was just used to sign in somewhere else, so this dashboard has stopped. '
          'Only one Controller can run the booth at a time.',
      actionLabel: 'Back to sign in',
      onAction: () => ref.read(controllerAuthProvider.notifier).acknowledge(),
      footer: 'If this was not you, sign in again and tell the booth lead.',
    );
  }
}
