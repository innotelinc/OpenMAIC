import { describe, expect, it } from 'vitest';
import { DEFAULT_BRAND } from '@/lib/brand/brand-config';

describe('DEFAULT_BRAND (single-brand build)', () => {
  it('wears the AthenIQ learning mark for full chrome', () => {
    expect(DEFAULT_BRAND.productName).toBe('AthenIQ');
    expect(DEFAULT_BRAND.shortName).toBe('AthenIQ');
    expect(DEFAULT_BRAND.markSrc).toBe('/atheniq-mark.png');
    expect(DEFAULT_BRAND.themeColor).toBe('#10b981');
  });

  it('marks its horizontal logo as already containing the wordmark', () => {
    expect(DEFAULT_BRAND.logoHasWordmark).toBe(true);
    expect(DEFAULT_BRAND.logoSrc).toBe('/atheniq-logo.png');
  });
});
