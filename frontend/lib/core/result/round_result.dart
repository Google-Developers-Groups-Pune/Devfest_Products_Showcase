/// The round result, typed once for the phones and the big screen.
///
/// Parses `GET /api/player/result`, the display state's `result`, and the
/// `result:provisional` / `result:confirmed` events. Only public fields:
/// labels, shapes and scores, never a full name or entrance ID.
class RoundResult {
  const RoundResult({
    required this.status,
    this.myRank,
    this.winner,
    this.ranking = const [],
    this.tieBreakExplanation,
    this.story,
  });

  /// `CONFIRMED`, `PROVISIONAL` or a not-yet status such as `PENDING`.
  final String status;

  /// The player's own rank (phones only).
  final int? myRank;
  final ResultPlayer? winner;

  /// Sorted by rank, best first.
  final List<ResultPlayer> ranking;
  final String? tieBreakExplanation;
  final ResultStory? story;

  bool get confirmed => status == 'CONFIRMED';

  ResultPlayer? atRank(int rank) => ranking.where((r) => r.rank == rank).firstOrNull;

  factory RoundResult.fromJson(Map<String, dynamic> j) {
    final w = j['winner'];
    final s = j['story'];
    return RoundResult(
      status: '${j['status'] ?? ''}',
      myRank: _int(j['myRank']),
      winner: w is Map ? ResultPlayer.fromJson(Map<String, dynamic>.from(w)) : null,
      ranking: [
        for (final r in (j['ranking'] as List?) ?? const [])
          if (r is Map) ResultPlayer.fromJson(Map<String, dynamic>.from(r)),
      ]..sort((a, b) => (a.rank ?? 99).compareTo(b.rank ?? 99)),
      tieBreakExplanation: j['tieBreakExplanation'] as String?,
      story: s is Map ? ResultStory.fromJson(Map<String, dynamic>.from(s)) : null,
    );
  }
}

/// One player in the ranking, or the winner.
class ResultPlayer {
  const ResultPlayer({this.rank, this.slotNumber, required this.label, required this.shape, this.bestScore});

  final int? rank;
  final int? slotNumber;
  final String label;

  /// API shape value, such as `BLUE_CIRCLE`.
  final String shape;
  final int? bestScore;

  factory ResultPlayer.fromJson(Map<String, dynamic> j) => ResultPlayer(
    rank: _int(j['rank']),
    slotNumber: _int(j['slotNumber']),
    label: '${j['label'] ?? ''}',
    shape: '${j['shape'] ?? 'BLUE_CIRCLE'}',
    bestScore: _int(j['bestScore']),
  );
}

/// The treasure's story, shown after the round.
class ResultStory {
  const ResultStory({required this.title, required this.backstory, required this.imageUrl});

  final String title;
  final String backstory;
  final String imageUrl;

  factory ResultStory.fromJson(Map<String, dynamic> j) => ResultStory(
    title: '${j['title'] ?? ''}',
    backstory: '${j['backstory'] ?? ''}',
    imageUrl: '${j['imageUrl'] ?? ''}',
  );
}

int? _int(Object? v) => (v as num?)?.toInt();
