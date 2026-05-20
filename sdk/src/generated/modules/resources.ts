// AUTO-GENERATED — do not edit. Run `npm run generate` to update.

import type { HttpClient } from '../../http.js';
import type { PaginatedResponse, PaginationQuery } from '../../types.js';
import type { ResourceDto, CreateResourceInput, UpdateResourceInput } from '../schema.js';

export class ResourcesModule {
  constructor(private readonly http: HttpClient) {}

  list(query?: PaginationQuery & { q?: string }): Promise<PaginatedResponse<ResourceDto>> {
    const params = new URLSearchParams();
    if (query?.page !== undefined) params.set('page', String(query.page));
    if (query?.limit !== undefined) params.set('limit', String(query.limit));
    if (query?.q) params.set('q', query.q);
    const qs = params.toString();
    return this.http.get<PaginatedResponse<ResourceDto>>(
      `/api/resources${qs ? `?${qs}` : ''}`,
    );
  }

  get(id: string): Promise<ResourceDto> {
    return this.http.get<ResourceDto>(`/api/resources/${id}`);
  }

  create(body: CreateResourceInput): Promise<ResourceDto> {
    return this.http.post<ResourceDto>('/api/resources', body);
  }

  update(id: string, body: UpdateResourceInput): Promise<ResourceDto> {
    return this.http.patch<ResourceDto>(`/api/resources/${id}`, body);
  }

  delete(id: string): Promise<void> {
    return this.http.delete<void>(`/api/resources/${id}`);
  }
}
