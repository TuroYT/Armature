import { Module } from '@nestjs/common';
import { ResourceService } from './resource.service.js';
import { ResourceController } from './resource.controller.js';
import { WebsocketModule } from '../websocket/websocket.module.js';

/**
 * Example resource module — demonstrates all Armature conventions.
 * Remove this module (and the Resource model in schema.prisma) when
 * using Armature as your project base.
 */
@Module({
  imports: [WebsocketModule],
  controllers: [ResourceController],
  providers: [ResourceService],
})
export class ResourceModule {}
