import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { LoggerService } from '../common/logger/logger.service.js';
import { ErrorCode } from '../common/constants/error-constants.js';
import { serialize } from '../common/utils/serialize.js';
import {
  buildPaginationMeta,
  type PaginationMetaDto,
} from '../common/dto/paginated-response.dto.js';
import type { CreateResourceDto } from './dto/create-resource.dto.js';
import type { UpdateResourceDto } from './dto/update-resource.dto.js';
import { ResourceResponseDto } from './dto/resource-response.dto.js';
import type { PaginationQueryDto } from '../common/dto/pagination-query.dto.js';
import { WebsocketGateway } from '../websocket/websocket.gateway.js';

@Injectable()
export class ResourceService {
  private readonly logger: LoggerService;

  constructor(
    private readonly prisma: PrismaService,
    private readonly ws: WebsocketGateway,
    logger: LoggerService,
  ) {
    this.logger = logger.withContext('ResourceService');
  }

  async create(
    dto: CreateResourceDto,
    ownerId: string,
  ): Promise<ResourceResponseDto> {
    const resource = await this.prisma.resource.create({
      data: { ...dto, ownerId },
    });
    this.logger.log('Resource created', { resourceId: resource.id, ownerId });
    const response = serialize(ResourceResponseDto, resource);
    this.emitEvent('resource:created', response);
    return response;
  }

  async findAll(
    query: PaginationQueryDto,
  ): Promise<{ data: ResourceResponseDto[]; meta: PaginationMetaDto }> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where = query.q
      ? { name: { contains: query.q, mode: 'insensitive' as const } }
      : {};

    // Single round-trip: list + count run inside one transaction so they see
    // a consistent snapshot of the table even when concurrent writes occur.
    const [items, total] = await this.prisma.$transaction([
      this.prisma.resource.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.resource.count({ where }),
    ]);

    return {
      data: serialize(
        ResourceResponseDto,
        items,
      ) as unknown as ResourceResponseDto[],
      meta: buildPaginationMeta(page, limit, total),
    };
  }

  async findOne(id: string): Promise<ResourceResponseDto> {
    const resource = await this.prisma.resource.findUnique({ where: { id } });
    if (!resource) throw new NotFoundException(ErrorCode.RESOURCE_NOT_FOUND);
    return serialize(ResourceResponseDto, resource);
  }

  async update(
    id: string,
    dto: UpdateResourceDto,
    userId: string,
    isAdmin: boolean,
  ): Promise<ResourceResponseDto> {
    const resource = await this.prisma.resource.findUnique({ where: { id } });
    if (!resource) throw new NotFoundException(ErrorCode.RESOURCE_NOT_FOUND);
    if (!isAdmin && resource.ownerId !== userId) {
      throw new ForbiddenException(ErrorCode.FORBIDDEN);
    }

    const updated = await this.prisma.resource.update({
      where: { id },
      data: dto,
    });
    const response = serialize(ResourceResponseDto, updated);
    this.emitEvent('resource:updated', response);
    return response;
  }

  async remove(id: string, userId: string, isAdmin: boolean): Promise<void> {
    const resource = await this.prisma.resource.findUnique({ where: { id } });
    if (!resource) throw new NotFoundException(ErrorCode.RESOURCE_NOT_FOUND);
    if (!isAdmin && resource.ownerId !== userId) {
      throw new ForbiddenException(ErrorCode.FORBIDDEN);
    }

    await this.prisma.resource.delete({ where: { id } });
    this.logger.log('Resource deleted', { resourceId: id });
    this.emitEvent('resource:deleted', { id });
  }

  /**
   * Fire-and-forget WebSocket emit.
   * Errors are logged but never propagate to the caller — a WS failure must
   * not affect the REST response.
   */
  private emitEvent<T>(event: string, data: T): void {
    void this.ws.emit(event, data).catch((err: unknown) =>
      this.logger.warn('WebSocket emit failed', {
        event,
        error: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
      }),
    );
  }
}
