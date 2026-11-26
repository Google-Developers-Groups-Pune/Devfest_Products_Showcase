import type { Logger } from 'pino';
import type { RealtimeEmitter } from './emitter.js';
import type { Connection } from './events.js';
import type { PlayerConnectionStore, PlayerIdentity } from './ports.js';

/**
 * Tracks which players have an open socket, and sends `player:connection` when a player goes
 * from no sockets to one (CONNECTED) or from one to none (DISCONNECTED). A second tab, or a
 * reconnect that arrives before the old socket has timed out, sends nothing.
 *
 * In memory, which is correct because the backend runs as one instance (D1).
 */
export class PresenceTracker {
  private readonly sockets = new Map<string, Set<string>>();
  // Changes for one player are recorded and emitted in order, even though the store is async.
  private readonly queues = new Map<string, Promise<void>>();

  constructor(
    private readonly store: PlayerConnectionStore,
    private readonly emitter: RealtimeEmitter,
    private readonly logger: Logger,
  ) {}

  isConnected(playerId: string): boolean {
    return (this.sockets.get(playerId)?.size ?? 0) > 0;
  }

  connected(player: PlayerIdentity, socketId: string): void {
    let open = this.sockets.get(player.playerId);
    if (!open) {
      open = new Set();
      this.sockets.set(player.playerId, open);
    }
    open.add(socketId);
    if (open.size === 1) this.enqueue(player, 'CONNECTED');
  }

  disconnected(player: PlayerIdentity, socketId: string): void {
    const open = this.sockets.get(player.playerId);
    if (!open?.delete(socketId)) return;
    if (open.size === 0) {
      this.sockets.delete(player.playerId);
      this.enqueue(player, 'DISCONNECTED');
    }
  }

  /** Resolves when every queued change has been recorded and emitted. For tests and shutdown. */
  async idle(): Promise<void> {
    await Promise.all(this.queues.values());
  }

  private enqueue(player: PlayerIdentity, connection: Connection): void {
    const previous = this.queues.get(player.playerId) ?? Promise.resolve();
    const next = previous.then(() => this.record(player, connection));
    this.queues.set(player.playerId, next);
    void next.finally(() => {
      if (this.queues.get(player.playerId) === next) this.queues.delete(player.playerId);
    });
  }

  private async record(player: PlayerIdentity, connection: Connection): Promise<void> {
    try {
      const info = await this.store.recordConnection(player.playerId, connection);
      if (!info?.inActiveSession) return;
      this.emitter.toAll(player.sessionId, 'player:connection', {
        slotNumber: info.slotNumber,
        label: info.revealed ? info.label : null,
        connection,
      });
    } catch (err) {
      this.logger.error({ err, playerId: player.playerId, connection }, 'Could not record player connection');
    }
  }
}
