import type { Clock } from '../core/clock.js';
import { AGENT_NAMES, type AgentName, type Agents } from './types.js';

/** API 18 response shapes (contract: `AgentHealth`, `getAgentHealth`). */
export type AgentStatus = 'UP' | 'DOWN';

export interface AgentHealth {
  status: AgentStatus;
  latencyMs: number;
  model: string;
}

export interface AgentHealthReport {
  checkedAt: string;
  allHealthy: boolean;
  agents: Record<AgentName, AgentHealth>;
}

export interface AgentHealthOptions {
  /** How long a report is reused. API 18 says 60 seconds. */
  ttlMs?: number;
  /** A probe slower than this counts as DOWN. */
  probeTimeoutMs?: number;
  /** Milliseconds for latency. Defaults to `performance.now`. */
  now?: () => number;
}

/**
 * Probes all five agents in parallel and caches the report for 60 seconds (BE-14, API 18).
 * One agent failing marks only that agent DOWN. Starting a round needs all five UP (D28).
 */
export class AgentHealthService {
  private readonly ttlMs: number;
  private readonly probeTimeoutMs: number;
  private readonly now: () => number;
  private cached: { report: AgentHealthReport; at: number } | undefined;
  private inFlight: Promise<AgentHealthReport> | undefined;

  constructor(
    private readonly agents: Agents,
    private readonly clock: Clock,
    options: AgentHealthOptions = {},
  ) {
    this.ttlMs = options.ttlMs ?? 60_000;
    this.probeTimeoutMs = options.probeTimeoutMs ?? 10_000;
    this.now = options.now ?? (() => performance.now());
  }

  /** The cached report if it is fresh, otherwise a new one. Concurrent callers share one probe. */
  check(): Promise<AgentHealthReport> {
    const cached = this.cached;
    if (cached && this.clock.now().getTime() - cached.at < this.ttlMs) return Promise.resolve(cached.report);
    this.inFlight ??= this.probeAll().finally(() => {
      this.inFlight = undefined;
    });
    return this.inFlight;
  }

  private async probeAll(): Promise<AgentHealthReport> {
    const checkedAt = this.clock.now();
    const results = await Promise.all(AGENT_NAMES.map((name) => this.probe(name)));
    const agents = Object.fromEntries(AGENT_NAMES.map((name, i) => [name, results[i]])) as Record<
      AgentName,
      AgentHealth
    >;
    const report: AgentHealthReport = {
      checkedAt: checkedAt.toISOString(),
      allHealthy: results.every((result) => result.status === 'UP'),
      agents,
    };
    this.cached = { report, at: checkedAt.getTime() };
    return report;
  }

  private async probe(name: AgentName): Promise<AgentHealth> {
    const agent = this.agents[name];
    const started = this.now();
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => reject(new Error('Health probe timed out')), this.probeTimeoutMs);
    });
    let status: AgentStatus = 'UP';
    try {
      await Promise.race([agent.ping(), timeout]);
    } catch {
      status = 'DOWN';
    } finally {
      clearTimeout(timer);
    }
    return { status, latencyMs: Math.round(this.now() - started), model: agent.model };
  }
}
