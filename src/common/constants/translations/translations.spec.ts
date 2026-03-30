import { resolveLanguage, translate, DEFAULT_LANGUAGE } from './index.js';
import { ErrorCode } from '../error-constants.js';

describe('resolveLanguage', () => {
  it('returns the default language when no header is provided', () => {
    expect(resolveLanguage()).toBe(DEFAULT_LANGUAGE);
    expect(resolveLanguage(undefined)).toBe(DEFAULT_LANGUAGE);
  });

  it('resolves French from a full Accept-Language header', () => {
    expect(resolveLanguage('fr-FR,fr;q=0.9,en;q=0.8')).toBe('fr');
  });

  it('resolves English from a simple header', () => {
    expect(resolveLanguage('en')).toBe('en');
  });

  it('picks the highest quality match', () => {
    expect(resolveLanguage('en;q=0.5,fr;q=0.9')).toBe('fr');
  });

  it('falls back to the default language for unsupported locales', () => {
    expect(resolveLanguage('ja,zh;q=0.9')).toBe(DEFAULT_LANGUAGE);
  });
});

describe('translate', () => {
  it('returns a non-empty string for every defined ErrorCode in English', () => {
    for (const code of Object.values(ErrorCode)) {
      const msg = translate(code, 'en');
      expect(typeof msg).toBe('string');
      expect(msg.length).toBeGreaterThan(0);
    }
  });

  it('returns a non-empty string for every defined ErrorCode in French', () => {
    for (const code of Object.values(ErrorCode)) {
      const msg = translate(code, 'fr');
      expect(typeof msg).toBe('string');
      expect(msg.length).toBeGreaterThan(0);
    }
  });

  it('returns different strings for en and fr', () => {
    const en = translate(ErrorCode.USER_NOT_FOUND, 'en');
    const fr = translate(ErrorCode.USER_NOT_FOUND, 'fr');
    expect(en).not.toBe(fr);
  });
});
