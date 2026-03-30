import { Injectable } from '@nestjs/common';
import { SocialProvider } from './social-provider.port.js';

@Injectable()
export class GoogleSocialProvider extends SocialProvider {
  readonly id = 'google';
  readonly label = 'Google';
  readonly enabled =
    !!process.env['GOOGLE_CLIENT_ID'] && !!process.env['GOOGLE_CLIENT_SECRET'];
}
