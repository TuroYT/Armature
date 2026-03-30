import type { ErrorCode } from '../error-constants.js';
import { en } from './en.js';
import { fr } from './fr.js';

export type SupportedLanguage = 'en' | 'fr';

export const SUPPORTED_LANGUAGES: readonly SupportedLanguage[] = ['en', 'fr'];
export const DEFAULT_LANGUAGE: SupportedLanguage = 'en';

const translations: Record<SupportedLanguage, Record<ErrorCode, string>> = {
  en,
  fr,
};

/**
 * Translate an ErrorCode into the given language.
 * Falls back to the code itself if no translation is found.
 */
export function translate(code: ErrorCode, lang: SupportedLanguage): string {
  return translations[lang]?.[code] ?? code;
}

/**
 * Resolve the best matching supported language from an Accept-Language header.
 * Falls back to DEFAULT_LANGUAGE if nothing matches.
 */
export function resolveLanguage(acceptLanguage?: string): SupportedLanguage {
  if (!acceptLanguage) return DEFAULT_LANGUAGE;

  const preferred = acceptLanguage
    .split(',')
    .map((part) => {
      const [lang, q] = part.trim().split(';q=');
      return {
        lang: lang.trim().split('-')[0].toLowerCase(),
        q: q ? parseFloat(q) : 1,
      };
    })
    .sort((a, b) => b.q - a.q);

  for (const { lang } of preferred) {
    if (lang in translations) {
      return lang as SupportedLanguage;
    }
  }

  return DEFAULT_LANGUAGE;
}
