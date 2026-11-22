import 'package:flutter_test/flutter_test.dart';
import 'package:material_ui/material_ui.dart';

import 'package:prompt_heist/core/theme/heist_theme.dart';
import 'package:prompt_heist/core/widgets/timer_pill.dart';

void main() {
  group('scoreTone (D25)', () {
    test('bands: 0–39 red, 40–79 yellow, 80–99 blue, 100 green', () {
      for (final s in [0, 1, 39]) {
        expect(scoreTone(s), Tone.danger, reason: '$s');
      }
      for (final s in [40, 79]) {
        expect(scoreTone(s), Tone.warning, reason: '$s');
      }
      for (final s in [80, 99]) {
        expect(scoreTone(s), Tone.accent, reason: '$s');
      }
      expect(scoreTone(100), Tone.success);
      expect(scoreTone(null), Tone.neutral);
    });

    test('scoreColor uses the Google logo palette', () {
      expect(scoreColor(10), const Color(0xFFEA4335));
      expect(scoreColor(50), const Color(0xFFFBBC05));
      expect(scoreColor(90), const Color(0xFF4285F4));
      expect(scoreColor(100), const Color(0xFF34A853));
    });
  });

  group('SlotShape', () {
    test('is fixed by slot, as in the shared contract', () {
      expect(SlotShape.forSlot(1).apiValue, 'BLUE_CIRCLE');
      expect(SlotShape.forSlot(2).apiValue, 'RED_SQUARE');
      expect(SlotShape.forSlot(3).apiValue, 'YELLOW_DIAMOND');
      expect(SlotShape.forSlot(4).apiValue, 'GREEN_PILL');
      expect(SlotShape.forSlot(5).apiValue, 'GREEN_CIRCLE');
    });

    test('parses API values and rejects unknown ones', () {
      for (final s in SlotShape.values) {
        expect(SlotShape.fromApi(s.apiValue), s);
      }
      expect(() => SlotShape.fromApi('PURPLE_STAR'), throwsArgumentError);
    });
  });

  group('timer', () {
    test('formatClock rounds partial seconds up and never goes negative', () {
      expect(formatClock(const Duration(seconds: 61)), '01:01');
      expect(formatClock(const Duration(milliseconds: 200)), '00:01');
      expect(formatClock(Duration.zero), '00:00');
      expect(formatClock(const Duration(seconds: -3)), '00:00');
      expect(formatClock(const Duration(seconds: 600)), '10:00');
    });

    test('TimerPill turns yellow at 30s and red at 10s', () {
      expect(TimerPill.toneFor(const Duration(seconds: 31)), Tone.accent);
      expect(TimerPill.toneFor(const Duration(seconds: 30)), Tone.warning);
      expect(TimerPill.toneFor(const Duration(seconds: 11)), Tone.warning);
      expect(TimerPill.toneFor(const Duration(seconds: 10)), Tone.danger);
    });
  });
}
