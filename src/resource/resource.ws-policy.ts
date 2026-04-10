import { Injectable, OnModuleInit } from '@nestjs/common';
import { WsPolicyRegistry } from '../websocket/policies/ws-policy.registry.js';
import type { ResourceResponseDto } from './dto/resource-response.dto.js';

/**
 * WebSocket policies for the Resource domain.
 *
 * Defines who can receive each real-time event — similar to Supabase Row-Level
 * Security policies but applied at the WebSocket emission layer.
 *
 * ## Rules
 *
 * | Event               | Who receives it                                    |
 * |---------------------|----------------------------------------------------|
 * | `resource:created`  | Admin **or** the resource owner                   |
 * | `resource:updated`  | Admin **or** the resource owner                   |
 * | `resource:deleted`  | Admin **or** the resource owner (by stored id)    |
 * | Room `resources`    | Admin only                                         |
 *
 * ## Customising
 * Edit the arrow functions below — they have full access to `user` (roles,
 * id, email) and the event `payload`.
 *
 * ```ts
 * // Allow all authenticated users to receive resource:created
 * this.registry.register('resource:created', () => true);
 *
 * // Only users with a specific permission
 * this.registry.register('resource:created', (user) =>
 *   user.roles.includes('moderator'),
 * );
 * ```
 *
 * Remove or replace this file when using Armature as your project base.
 */
@Injectable()
export class ResourceWsPolicy implements OnModuleInit {
  constructor(private readonly registry: WsPolicyRegistry) {}

  onModuleInit(): void {
    // ── resource:created ────────────────────────────────────────────────────
    this.registry.register<ResourceResponseDto>(
      'resource:created',
      (user, resource) =>
        user.roles.includes('admin') || resource.ownerId === user.id,
    );

    // ── resource:updated ────────────────────────────────────────────────────
    this.registry.register<ResourceResponseDto>(
      'resource:updated',
      (user, resource) =>
        user.roles.includes('admin') || resource.ownerId === user.id,
    );

    // ── resource:deleted ────────────────────────────────────────────────────
    // The deleted payload only carries `{ id }`, so ownership can't be checked
    // without a DB lookup — restrict to admins by default.
    this.registry.register<{ id: string }>(
      'resource:deleted',
      (user) => user.roles.includes('admin'),
    );

    // ── Room: 'resources' ───────────────────────────────────────────────────
    // Only admins may subscribe to the shared 'resources' room.
    this.registry.registerRoomPolicy(
      'resources',
      (user) => user.roles.includes('admin'),
    );
  }
}
