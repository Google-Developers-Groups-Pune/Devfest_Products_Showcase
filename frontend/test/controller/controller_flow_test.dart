import 'package:material_ui/material_ui.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:prompt_heist/core/mock/mock_controller.dart';
import 'package:prompt_heist/core/storage/controller_session.dart';
import 'package:prompt_heist/features/controller/controller_shell.dart';
import 'package:prompt_heist/features/controller/controller_state.dart';

/// Drives the real Controller screens against the in-app mock.
void main() {
  late DateTime now;

  setUp(() {
    MockController.autoClock = false;
    MockController.reset();
    forgetControllerSession();
    now = DateTime.now().toUtc();
    MockController.clock = () => now;
    ControllerNotifier.now = () => now;
  });

  Future<void> settle(WidgetTester tester, [int steps = 10]) async {
    for (var i = 0; i < steps; i++) {
      await tester.pump(const Duration(milliseconds: 200));
    }
  }

  Future<void> pumpShell(WidgetTester tester) async {
    tester.view.physicalSize = const Size(1600, 1400);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(const ProviderScope(child: MaterialApp(home: ControllerShell())));
    await settle(tester);
  }

  Future<void> signIn(WidgetTester tester, {String password = 'devfest'}) async {
    await tester.enterText(find.byKey(const Key('login-username')), 'controller');
    await tester.enterText(find.byKey(const Key('login-password')), password);
    await tester.tap(find.text('Sign in'));
    await settle(tester);
  }

  testWidgets('login: Username label, error state, no demo-credentials line', (tester) async {
    await pumpShell(tester);
    expect(find.text('Username'), findsOneWidget);
    expect(find.text('Email'), findsNothing);
    expect(find.textContaining('any email'), findsNothing);
    await signIn(tester, password: 'wrong');
    expect(find.text('Wrong username or password.'), findsOneWidget);
  });

  testWidgets('sign in, open a session, review names and reach Ready', (tester) async {
    await pumpShell(tester);
    await signIn(tester);
    expect(find.text('Open a new session'), findsOneWidget);
    expect(loadControllerSession(), isNotNull, reason: 'token kept for the session');

    await tester.tap(find.text('Open session'));
    await settle(tester);
    expect(find.text('Hand out booth codes'), findsOneWidget);
    expect(find.textContaining("can't start early"), findsOneWidget);

    MockController.fillPlayers();
    await settle(tester);
    expect(find.text('5 of 5 players joined'), findsOneWidget);

    // Name review: reject one and type the replacement.
    await tester.tap(find.byKey(const Key('reject-name-1')));
    await settle(tester, 2);
    await tester.enterText(find.byKey(const Key('rename-field')), 'Aman Sharma');
    await tester.tap(find.byKey(const Key('rename-save')));
    await settle(tester);
    expect(find.textContaining('Aman Sharma'), findsWidgets);
    for (var i = 2; i <= 5; i++) {
      await tester.tap(find.byKey(Key('approve-name-$i')));
      await settle(tester, 3);
    }
    expect(find.text('Name reviewed'), findsNWidgets(5));

    await tester.tap(find.text('Generate treasure'));
    await settle(tester);
    expect(find.text('The Treasure Generator is drafting a candidate'), findsOneWidget);
    now = now.add(Duration(seconds: MockController.generationSeconds));
    MockController.tick();
    await settle(tester);
    expect(find.text('Passed content filter'), findsOneWidget);
    // The image cannot load in tests, so Approve stays disabled.
    final approve = tester.widget<FilledButton>(find.ancestor(of: find.text('Approve'), matching: find.byType(FilledButton)).first);
    expect(approve.onPressed, isNull);
  });

  testWidgets('signed in elsewhere shows the message, then the login card', (tester) async {
    await pumpShell(tester);
    await signIn(tester);
    MockController.kickController();
    await settle(tester);
    expect(find.text('Signed in on another device'), findsOneWidget);
    await tester.tap(find.text('Back to sign in'));
    await settle(tester);
    expect(find.text('Sign in to run the booth'), findsOneWidget);
  });

  testWidgets('a 401 sends the Controller back to login', (tester) async {
    await pumpShell(tester);
    await signIn(tester);
    MockController.db['token'] = 'revoked';
    await tester.tap(find.text('Open session'));
    await settle(tester);
    expect(find.text('Sign in to run the booth'), findsOneWidget);
    expect(find.textContaining('sign-in expired'), findsOneWidget);
  });

  testWidgets('close event day is blocked until a CSV is exported', (tester) async {
    await pumpShell(tester);
    await signIn(tester);
    await tester.tap(find.byKey(const Key('close-event')));
    await settle(tester, 3);
    expect(find.textContaining('Blocked: export the winners CSV first'), findsOneWidget);
    await tester.tap(find.text('Cancel'));
    await settle(tester, 3);

    await tester.tap(find.byKey(const Key('export-csv')));
    await settle(tester);
    await tester.tap(find.byKey(const Key('close-event')));
    await settle(tester, 3);
    await tester.enterText(find.byKey(const Key('close-confirm-field')), 'CLOSE EVENT');
    await settle(tester, 1);
    await tester.tap(find.byKey(const Key('close-confirm')));
    await settle(tester);
    expect(find.text('Closing the event day…'), findsOneWidget);
    now = now.add(const Duration(seconds: 3));
    MockController.tick();
    await settle(tester);
    expect(find.text('Event day closed'), findsWidgets);
  });
}
