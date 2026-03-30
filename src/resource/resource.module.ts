import { Module } from '@nestjs/common';
import { ResourceService } from './resource.service.js';
import { ResourceController } from './resource.controller.js';

/**
 * Example resource module — demonstrates all Armature conventions.
 * Remove this module (and the Resource model in schema.prisma) when
 * using Armature as your project base.
 */
@Module({
  controllers: [ResourceController],
  providers: [ResourceService],
})
export class ResourceModule {}
