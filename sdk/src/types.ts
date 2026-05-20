export interface TokensDto {
  accessToken: string;
  refreshToken?: string | null;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: PaginationMeta;
}

export interface PaginationQuery {
  page?: number;
  limit?: number;
}

export interface ArmatureClientConfig {
  baseUrl: string;
  onTokensRefreshed?: (tokens: TokensDto) => void;
}
