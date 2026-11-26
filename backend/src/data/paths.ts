/**
 * Every Firestore path in one place (BE-03, PRD section 11).
 *
 *   controllers/{controllerId}              not event data, survives closure
 *   system/eventStatus                      not event data, survives closure
 *   events/{eventId}
 *     entranceIds/{sha256 of entrance ID}
 *     auditEvents/{auditEventId}
 *     sessions/{sessionId}
 *       slots/{slotNumber}
 *       players/{playerId}
 *       candidates/{candidateId}
 *       rounds/{roundId}
 *         prompts/{promptId}
 *         scores/{promptId}
 *         reactions/{promptId}
 *         result/current
 */

export interface SessionRef {
  eventId: string;
  sessionId: string;
}

export interface RoundRef extends SessionRef {
  roundId: string;
}

/**
 * Checks one path segment. The value is left out of the message on purpose,
 * because some IDs could be personal data.
 */
function segment(label: string, value: string | number): string {
  const text = String(value);
  if (text === '' || text.includes('/') || text === '.' || text === '..' || /^__.*__$/.test(text)) {
    throw new Error(`Invalid Firestore ID for ${label}`);
  }
  return text;
}

export const paths = {
  controllers: () => 'controllers',
  eventStatus: () => 'system/eventStatus',

  events: () => 'events',
  event: (eventId: string) => `events/${segment('eventId', eventId)}`,
  entranceIds: (eventId: string) => `${paths.event(eventId)}/entranceIds`,
  auditEvents: (eventId: string) => `${paths.event(eventId)}/auditEvents`,
  sessions: (eventId: string) => `${paths.event(eventId)}/sessions`,

  session: (ref: SessionRef) => `${paths.sessions(ref.eventId)}/${segment('sessionId', ref.sessionId)}`,
  slots: (ref: SessionRef) => `${paths.session(ref)}/slots`,
  players: (ref: SessionRef) => `${paths.session(ref)}/players`,
  candidates: (ref: SessionRef) => `${paths.session(ref)}/candidates`,
  rounds: (ref: SessionRef) => `${paths.session(ref)}/rounds`,

  round: (ref: RoundRef) => `${paths.rounds(ref)}/${segment('roundId', ref.roundId)}`,
  prompts: (ref: RoundRef) => `${paths.round(ref)}/prompts`,
  scores: (ref: RoundRef) => `${paths.round(ref)}/scores`,
  reactions: (ref: RoundRef) => `${paths.round(ref)}/reactions`,
  result: (ref: RoundRef) => `${paths.round(ref)}/result/current`,

  /** Checks a document ID before it is used inside a collection. */
  docId: (label: string, id: string | number) => segment(label, id),
} as const;
