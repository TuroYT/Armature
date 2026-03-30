import { Injectable } from '@nestjs/common';
import type { ErrorCode } from '../constants/error-constants.js';
import {
  type SupportedLanguage,
  translate,
  resolveLanguage,
} from '../constants/translations/index.js';

@Injectable()
export class I18nService {
  translate(code: ErrorCode, lang: SupportedLanguage): string {
    return translate(code, lang);
  }

  resolveLocale(acceptLanguage?: string): SupportedLanguage {
    return resolveLanguage(acceptLanguage);
  }
}
