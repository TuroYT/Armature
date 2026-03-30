import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ResourceService } from './resource.service.js';
import { CreateResourceDto } from './dto/create-resource.dto.js';
import { UpdateResourceDto } from './dto/update-resource.dto.js';
import { ResourceResponseDto } from './dto/resource-response.dto.js';
import { IdParamsDto } from '../common/dto/params.dto.js';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto.js';
import { createPaginatedDto } from '../common/dto/paginated-response.dto.js';
import { ErrorResponseDto } from '../common/dto/error-response.dto.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Roles } from '../guards/roles.decorator.js';
import { RolesGuard } from '../guards/roles.guard.js';
import {
  RequirePermissions,
  PermissionsGuard,
} from '../guards/permissions.guard.js';
import type { AuthUser } from '../auth/strategies/jwt.strategy.js';

class PaginatedResourceDto extends createPaginatedDto(ResourceResponseDto) {}

@ApiTags('Resources')
@ApiBearerAuth()
@Controller('api/resources')
export class ResourceController {
  constructor(private readonly resourceService: ResourceService) {}

  @Post()
  @RequirePermissions('resources:write')
  @UseGuards(PermissionsGuard)
  @ApiOperation({ summary: 'Create a new resource' })
  @ApiResponse({ status: 201, type: ResourceResponseDto })
  create(
    @Body() dto: CreateResourceDto,
    @CurrentUser() user: AuthUser,
  ): Promise<ResourceResponseDto> {
    return this.resourceService.create(dto, user.id);
  }

  @Get()
  @ApiOperation({ summary: 'List all resources (paginated)' })
  @ApiResponse({ status: 200, type: PaginatedResourceDto })
  findAll(@Query() query: PaginationQueryDto): Promise<PaginatedResourceDto> {
    return this.resourceService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a resource by ID' })
  @ApiResponse({ status: 200, type: ResourceResponseDto })
  @ApiResponse({ status: 404, type: ErrorResponseDto })
  findOne(@Param() params: IdParamsDto): Promise<ResourceResponseDto> {
    return this.resourceService.findOne(params.id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a resource (owner or admin)' })
  @ApiResponse({ status: 200, type: ResourceResponseDto })
  update(
    @Param() params: IdParamsDto,
    @Body() dto: UpdateResourceDto,
    @CurrentUser() user: AuthUser,
  ): Promise<ResourceResponseDto> {
    return this.resourceService.update(
      params.id,
      dto,
      user.id,
      user.roles.includes('admin'),
    );
  }

  @Delete(':id')
  @Roles('admin')
  @UseGuards(RolesGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a resource (admin only)' })
  @ApiResponse({ status: 204, description: 'Deleted' })
  async remove(
    @Param() params: IdParamsDto,
    @CurrentUser() user: AuthUser,
  ): Promise<void> {
    await this.resourceService.remove(
      params.id,
      user.id,
      user.roles.includes('admin'),
    );
  }
}
