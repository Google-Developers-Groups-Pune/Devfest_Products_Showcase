import { stringify } from 'csv-stringify/sync';
import type { Clock } from '../core/clock.js';
import { AppError } from '../core/errors.js';
import type { EventStatus } from '../data/types.js';

/**
 * Winners CSV (BE-28, API 15, FR-R01). Built in memory: nothing is written to disk or Storage.
 * Exporting sets `csvExportedAt` and `csvUpToDate`, which closing the event day needs (D44, BE-29).
 */

export const WINNERS_CSV_FILENAME = 'prompt-heist-winners.csv';

export const WINNERS_CSV_COLUMNS = [
  'full_name',
  'entrance_id',
  'round_number',
  'confirmed_at',
  'winning_score',
  'treasure_title',
  'treasure_id',
] as const;

/** One confirmed round. Discarded rounds never become a row. */
export interface WinnerRow {
  fullName: string;
  entranceId: string;
  roundNumber: number;
  confirmedAt: Date;
  winningScore: number;
  treasureTitle: string;
  treasureId: string;
}

/** What the export needs from storage. `firestoreWinnersStore` is the real one. */
export interface WinnersExportStore {
  eventStatus(): Promise<EventStatus>;
  /** Every confirmed round of the event day, in any order. */
  listConfirmedWinners(): Promise<WinnerRow[]>;
  /** Sets `csvExportedAt = at` and `csvUpToDate = true`. */
  markExported(at: Date): Promise<void>;
}

export interface WinnersExport {
  filename: string;
  csv: string;
  rowCount: number;
}

/** First characters that make a spreadsheet treat a cell as a formula (OWASP CSV injection). */
const FORMULA_START = /^[=+\-@\t\r]/;

/** Prefixes a quote so Excel and Sheets show the text instead of running it as a formula. */
export function escapeCell(value: string): string {
  return FORMULA_START.test(value) ? `'${value}` : value;
}

/** Header row, then one row per confirmed round, ordered by round number. */
export function buildWinnersCsv(rows: WinnerRow[]): string {
  const records = [...rows]
    .sort((a, b) => a.roundNumber - b.roundNumber)
    .map((row) => [
      escapeCell(row.fullName),
      escapeCell(row.entranceId),
      String(row.roundNumber),
      row.confirmedAt.toISOString(),
      String(row.winningScore),
      escapeCell(row.treasureTitle),
      escapeCell(row.treasureId),
    ]);
  // A byte order mark lets Excel read UTF-8, so names in Hindi or with accents show correctly.
  return `\uFEFF${stringify([[...WINNERS_CSV_COLUMNS], ...records], { record_delimiter: 'windows' })}`;
}

export class WinnersExportService {
  constructor(
    private readonly store: WinnersExportStore,
    private readonly clock: Clock,
  ) {}

  /**
   * Builds the CSV and marks it exported. With no winners the file is the header row only,
   * and that still counts as exported (D44).
   *
   * Refused once the event day is closing or closed: the data is being deleted or gone.
   */
  async export(): Promise<WinnersExport> {
    const status = await this.store.eventStatus();
    if (status === 'CLOSING' || status === 'CLOSED') {
      throw new AppError(409, 'EVENT_CLOSED', 'The event day has been closed.');
    }
    const rows = await this.store.listConfirmedWinners();
    const csv = buildWinnersCsv(rows);
    await this.store.markExported(this.clock.now());
    return { filename: WINNERS_CSV_FILENAME, csv, rowCount: rows.length };
  }
}
