import type { Namespace } from 'socket.io';
import type {
  AllAudienceEvents,
  ControllerEvents,
  ControllerOldSocketEvents,
  DisplayEvents,
  PlayerEvents,
  PlayerOldSocketEvents,
  PlayerPrivateEvents,
} from './events.js';

/** Socket.IO room names. Players are grouped by session so a finished group's phones hear nothing of the next. */
export const rooms = {
  session: (sessionId: string) => `session:${sessionId}`,
  player: (playerId: string) => `player:${playerId}`,
  token: (tokenId: string) => `token:${tokenId}`,
};

export interface Namespaces {
  controller: Namespace;
  player: Namespace;
  display: Namespace;
}

/**
 * The only way the backend sends socket events. Each method accepts only the events its
 * audience may receive (asyncapi.yaml channels), so sending to the wrong audience does not
 * compile.
 */
export class RealtimeEmitter {
  constructor(private readonly ns: Namespaces) {}

  /** Controller, display and every player in the session. */
  toAll<E extends keyof AllAudienceEvents>(sessionId: string, event: E, payload: AllAudienceEvents[E]): void {
    this.ns.controller.emit(event, payload);
    this.ns.display.emit(event, payload);
    this.ns.player.to(rooms.session(sessionId)).emit(event, payload);
  }

  toController<E extends keyof ControllerEvents>(event: E, payload: ControllerEvents[E]): void {
    this.ns.controller.emit(event, payload);
  }

  toDisplay<E extends keyof DisplayEvents>(event: E, payload: DisplayEvents[E]): void {
    this.ns.display.emit(event, payload);
  }

  /** Every player in the session. */
  toPlayers<E extends keyof PlayerEvents>(sessionId: string, event: E, payload: PlayerEvents[E]): void {
    this.ns.player.to(rooms.session(sessionId)).emit(event, payload);
  }

  /** One player's private room. The only way to send `prompt:*`. */
  toPlayer<E extends keyof PlayerPrivateEvents>(playerId: string, event: E, payload: PlayerPrivateEvents[E]): void {
    this.ns.player.to(rooms.player(playerId)).emit(event, payload);
  }

  /**
   * Tells the Controller socket(s) using `tokenId` that a newer login replaced them, then
   * disconnects them (D29). The event is sent before the disconnect.
   */
  kickController<E extends keyof ControllerOldSocketEvents>(
    tokenId: string,
    event: E,
    payload: ControllerOldSocketEvents[E],
  ): void {
    const target = this.ns.controller.to(rooms.token(tokenId));
    target.emit(event, payload);
    target.disconnectSockets(true);
  }

  /** Disconnects every player and display socket. The Controller stays connected. For closing the event day (BE-29). */
  disconnectPlayersAndDisplay(): void {
    this.ns.player.disconnectSockets(true);
    this.ns.display.disconnectSockets(true);
  }

  /** Disconnects the Controller socket(s) using `tokenId`, with no event. For logout (BE-05). */
  disconnectController(tokenId: string): void {
    this.ns.controller.to(rooms.token(tokenId)).disconnectSockets(true);
  }

  /** Tells the player socket(s) using `tokenId` that a rejoin replaced them, then disconnects them. */
  kickPlayer<E extends keyof PlayerOldSocketEvents>(tokenId: string, event: E, payload: PlayerOldSocketEvents[E]): void {
    const target = this.ns.player.to(rooms.token(tokenId));
    target.emit(event, payload);
    target.disconnectSockets(true);
  }
}
