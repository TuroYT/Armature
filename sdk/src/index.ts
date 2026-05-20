export { ArmatureClient } from './client.js';
export { ArmatureError } from './errors.js';
export { RealtimeClient } from './realtime/realtime-client.js';
export type {
  ArmatureClientConfig,
  TokensDto,
  PaginatedResponse,
  PaginationMeta,
  PaginationQuery,
} from './types.js';
export type {
  RoleDto,
  UserDto,
  AuthResponseDto,
  AuthMethodDto,
  LoginInput,
  RegisterInput,
  ResourceDto,
  CreateResourceInput,
  UpdateResourceInput,
  HealthResponse,
} from './generated/schema.js';
