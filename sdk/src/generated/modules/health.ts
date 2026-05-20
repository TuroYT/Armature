// AUTO-GENERATED — do not edit. Run `npm run generate` to update.

import type { HttpClient } from '../../http.js';
import type { HealthResponse } from '../schema.js';

export class HealthModule {
  constructor(private readonly http: HttpClient) {}

  check(): Promise<HealthResponse> {
    return this.http.get<HealthResponse>('/health');
  }
}
