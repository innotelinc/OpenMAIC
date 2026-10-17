/**
 * Brand configuration.
 *
 * The reference (live deployment) resolves the brand per vendor from the
 * desktop shell's User-Agent token. This workspace has no vendor shell: the
 * product ships with its own single brand, so the config is static and the
 * desktop flag is always off. The shape is kept so surfaces that read the
 * brand (home hero, workspace rail, site header) keep one source of truth.
 */

export interface BrandConfig {
  /** Full product name (page titles, logo alt text). */
  productName: string;
  /** Short name for space-constrained spots. */
  shortName: string;
  /** Horizontal logo asset under `public/`. */
  logoSrc: string;
  /** Whether `logoSrc` already carries the product wordmark. */
  logoHasWordmark: boolean;
  /** Square brand mark under `public/` (favicon, workspace header). */
  markSrc: string;
  /** Browser theme color (`<meta name="theme-color">` / PWA). */
  themeColor: string;
}

/**
 * The brand the classroom wears: AthenIQ's learning mark — the graduation
 * cap crowned by the spark (`docs/Brand.md` in the AthenIQ checkout). The
 * rasters beside this file's `logoSrc`/`markSrc` are rendered from the same
 * geometry by `scripts/build-course-images.py`, so the classroom, the LMS
 * and the landing page cannot drift apart.
 */
export const DEFAULT_BRAND: BrandConfig = {
  productName: 'AthenIQ',
  shortName: 'AthenIQ',
  logoSrc: '/atheniq-logo.png',
  logoHasWordmark: true,
  markSrc: '/atheniq-mark.png',
  themeColor: '#10b981',
};
