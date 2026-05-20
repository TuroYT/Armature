// AUTO-GENERATED — do not edit. Run `npm run generate` to update.

export interface RoleDto {
  id: string;
  name: string;
  label: string;
}

export interface UserDto {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  avatarUrl: string | null;
  roles: RoleDto[];
  createdAt: string;
}

export interface AuthResponseDto {
  accessToken: string;
  refreshToken: string;
  user: UserDto;
}

export interface TokensDto {
  accessToken: string;
  refreshToken: string;
}

export interface AuthMethodDto {
  id: string;
  label: string;
  enabled: boolean;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface RegisterInput {
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
}

export interface ResourceDto {
  id: string;
  name: string;
  description: string | null;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateResourceInput {
  name: string;
  description?: string;
}

export interface UpdateResourceInput {
  name?: string;
  description?: string;
}

export interface HealthResponse {
  status: string;
  info?: Record<string, { status: string }>;
  error?: Record<string, { status: string }>;
  details?: Record<string, { status: string }>;
}
