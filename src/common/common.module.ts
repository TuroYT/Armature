import { Global, Module } from '@nestjs/common';
import { I18nService } from './services/i18n.service.js';

/**
 * Global common module — I18nService is available everywhere
 * without importing CommonModule explicitly.
 */
@Global()
@Module({
  providers: [I18nService],
  exports: [I18nService],
})
export class CommonModule {}
