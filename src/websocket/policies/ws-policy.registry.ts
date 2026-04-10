import { Injectable } from '@nestjs/common';
import type { AuthUser } from '../../auth/strategies/jwt.strategy.js';
import { LoggerService } from '../../common/logger/logger.service.js';

/**
 * A policy function that decides whether a given user is allowed to receive
 * a specific event payload.
 *
 * Return `true` to deliver the event, `false` to silently drop it for that client.
 *
 * ```ts
 * const myPolicy: WsPolicyFn<ResourceResponseDto> = (user, resource) =>
 *   user.roles.includes('admin') || resource.ownerId === user.id;
 * ```
 */
export type WsPolicyFn<T = unknown> = (
  user: AuthUser,
  payload: T,
) => boolean | Promise<boolean>;

/**
 * A policy function that decides whether a user is allowed to join a room.
 *
 * ```ts
 * const adminOnly: WsRoomPolicyFn = (user) => user.roles.includes('admin');
 * ```
 */
export type WsRoomPolicyFn = (user: AuthUser) => boolean | Promise<boolean>;

/**
 * Central registry for WebSocket event and room policies.
 *
 * Feature modules register their policies in `OnModuleInit` — the gateway
 * reads them before every `emit()` / `emitToRoom()` call and before allowing
 * a client to join a room.
 *
 * ## Registering event policies
 *
 * ```ts
 * // src/order/order.ws-policy.ts
 * @Injectable()
 * export class OrderWsPolicy implements OnModuleInit {
 *   constructor(private readonly registry: WsPolicyRegistry) {}
 *
 *   onModuleInit(): void {
 *     this.registry.register<OrderResponseDto>(
 *       'order:created',
 *       (user, order) => user.id === order.ownerId || user.roles.includes('admin'),
 *     );
 *   }
 * }
 * ```
 *
 * ## Registering room policies
 *
 * ```ts
 * this.registry.registerRoomPolicy('orders', (user) =>
 *   user.roles.includes('admin'),
 * );
 * ```
 *
 * ## Behaviour
 * - If **no policy** is registered for an event, the event is broadcast to
 *   **all authenticated clients** (every socket that passed the handshake
 *   middleware). Because all sockets are authenticated, this is safe for
 *   non-sensitive data but you **must** register a policy for any event that
 *   carries user-specific or sensitive payloads.
 * - If a policy is registered, the payload is evaluated per-client and only
 *   delivered to those for whom the policy returns `true`.
 * - If **no room policy** is registered, any authenticated client may join.
 */
@Injectable()
export class WsPolicyRegistry {
  private readonly logger: LoggerService;
  private readonly eventPolicies = new Map<string, WsPolicyFn>();
  private readonly roomPolicies = new Map<string, WsRoomPolicyFn>();

  constructor(logger: LoggerService) {
    this.logger = logger.withContext('WsPolicyRegistry');
  }

  /**
   * Register an event-level policy.
   * Overwrites any previously registered policy for the same event.
   */
  register<T>(event: string, policy: WsPolicyFn<T>): void {
    this.logger.debug(`Policy registered for event "${event}"`);
    this.eventPolicies.set(event, policy as WsPolicyFn);
  }

  /**
   * Register a room access policy.
   * Overwrites any previously registered policy for the same room.
   */
  registerRoomPolicy(room: string, policy: WsRoomPolicyFn): void {
    this.logger.debug(`Room policy registered for room "${room}"`);
    this.roomPolicies.set(room, policy);
  }

  /** Returns the policy for an event, or `undefined` if none is registered. */
  getEventPolicy(event: string): WsPolicyFn | undefined {
    return this.eventPolicies.get(event);
  }

  /** Returns the room policy, or `undefined` if none is registered. */
  getRoomPolicy(room: string): WsRoomPolicyFn | undefined {
    return this.roomPolicies.get(room);
  }
}
