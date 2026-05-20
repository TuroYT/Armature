import { HttpClient } from './http.js';
import { RealtimeClient } from './realtime/realtime-client.js';
import { AuthModule } from './generated/modules/auth.js';
import { ResourcesModule } from './generated/modules/resources.js';
import { HealthModule } from './generated/modules/health.js';
import type { ArmatureClientConfig, TokensDto } from './types.js';

export class ArmatureClient {
  readonly auth: AuthModule;
  readonly resources: ResourcesModule;
  readonly health: HealthModule;

  private readonly http: HttpClient;
  private readonly baseUrl: string;

  constructor(config: ArmatureClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    this.http = new HttpClient({ ...config, baseUrl: this.baseUrl });
    this.auth = new AuthModule(this.http, this.baseUrl);
    this.resources = new ResourcesModule(this.http);
    this.health = new HealthModule(this.http);
  }

  setTokens(tokens: TokensDto): void {
    this.http.setTokens(tokens);
  }

  getTokens(): { accessToken: string | null; refreshToken: string | null } {
    return this.http.getTokens();
  }

  realtime(): RealtimeClient {
    const { accessToken } = this.http.getTokens();
    if (!accessToken) {
      throw new Error('Cannot open realtime connection: no access token set. Call client.auth.login() or client.setTokens() first.');
    }
    return new RealtimeClient(this.baseUrl, accessToken);
  }
}
