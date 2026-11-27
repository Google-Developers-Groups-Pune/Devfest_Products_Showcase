import { burnPasswordCheck, verifyPassword } from '../auth/passwords.js';
import type { TokenService } from '../auth/tokens.js';
import { AppError } from '../core/errors.js';
import type { ControllerAuthStore } from './auth-stores.js';

export interface ControllerAccount {
  id: string;
  username: string;
}

export interface SignedInController {
  controllerId: string;
  username: string;
  tokenId: string;
  expiresAt: Date;
}

export interface LoginResult {
  token: string;
  expiresAt: Date;
  controller: ControllerAccount;
}

/** Realtime side effects, wired to the gateway in server.ts (BE-07). */
export interface ControllerAuthHooks {
  /** A newer login replaced this token: send `controller:kicked` to its socket (D29). */
  signedInElsewhere(oldTokenId: string): void;
  /** This token logged out: drop its socket. */
  loggedOut(tokenId: string): void;
}

const invalidCredentials = () => new AppError(401, 'INVALID_CREDENTIALS', 'Wrong username or password.');
const unauthenticated = () => new AppError(401, 'UNAUTHENTICATED', 'Please sign in again.');

/** The one Controller account: login, logout and token checks (BE-05). */
export class ControllerAuthService {
  constructor(
    private readonly store: ControllerAuthStore,
    private readonly tokens: TokenService,
    private readonly hooks: ControllerAuthHooks,
  ) {}

  async login(username: string, password: string): Promise<LoginResult> {
    const found = await this.store.findByUsername(username);
    if (found === undefined) {
      await burnPasswordCheck(password);
      throw invalidCredentials();
    }
    if (!(await verifyPassword(found.doc.passwordHash, password))) throw invalidCredentials();

    const issued = await this.tokens.signController(found.id);
    const previous = await this.store.replaceActiveToken(found.id, issued.tokenId);
    if (previous !== null) this.hooks.signedInElsewhere(previous);

    return {
      token: issued.token,
      expiresAt: issued.expiresAt,
      controller: { id: found.id, username: found.doc.username },
    };
  }

  /** Checks a Controller token. 401 UNAUTHENTICATED if invalid, expired, logged out or replaced. */
  async authenticate(token: string): Promise<SignedInController> {
    const claims = await this.tokens.verifyController(token).catch(() => {
      throw unauthenticated();
    });
    const doc = await this.store.get(claims.controllerId);
    if (doc === undefined || doc.activeTokenId !== claims.tokenId) throw unauthenticated();
    return { controllerId: claims.controllerId, username: doc.username, tokenId: claims.tokenId, expiresAt: claims.expiresAt };
  }

  async logout(controller: SignedInController): Promise<void> {
    await this.store.clearActiveToken(controller.controllerId, controller.tokenId);
    this.hooks.loggedOut(controller.tokenId);
  }
}
