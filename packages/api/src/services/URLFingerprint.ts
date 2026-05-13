import * as crypto from 'crypto';

/**
 * URL Fingerprinting Service
 * Normalizes URLs to detect duplicates regardless of parameter order
 */

export class URLFingerprint {
  /**
   * Generate unique fingerprint for a URL
   * Handles:
   * - Query parameter reordering
   * - Fragment removal
   * - Protocol normalization
   * - Trailing slash normalization
   */
  static generate(url: string): string {
    try {
      const parsed = new URL(url);

      // Normalize protocol
      let protocol = parsed.protocol.toLowerCase();
      if (protocol.endsWith(':')) {
        protocol = protocol.slice(0, -1);
      }

      // Normalize hostname
      const hostname = parsed.hostname?.toLowerCase() || '';

      // Normalize pathname
      let pathname = parsed.pathname;
      if (pathname.endsWith('/') && pathname !== '/') {
        pathname = pathname.slice(0, -1);
      }

      // Sort query parameters for consistency
      const params = new URLSearchParams(parsed.search);
      const sortedParams = new URLSearchParams(
        [...params.entries()].sort((a, b) => a[0].localeCompare(b[0]))
      );

      // Build normalized URL (NO FRAGMENT)
      const normalized = `${protocol}://${hostname}${pathname}${
        sortedParams.toString() ? `?${sortedParams.toString()}` : ''
      }`;

      // Generate SHA256 hash
      const hash = crypto
        .createHash('sha256')
        .update(normalized)
        .digest('hex');

      return hash;
    } catch (err) {
      // If URL parsing fails, hash raw URL
      return crypto.createHash('sha256').update(url).digest('hex');
    }
  }

  /**
   * Check if two URLs are equivalent
   */
  static isSame(url1: string, url2: string): boolean {
    return this.generate(url1) === this.generate(url2);
  }

  /**
   * Get normalized URL for logging
   */
  static normalize(url: string): string {
    try {
      const parsed = new URL(url);
      const params = new URLSearchParams(parsed.search);
      const sorted = new URLSearchParams(
        [...params.entries()].sort((a, b) => a[0].localeCompare(b[0]))
      );
      return `${parsed.protocol}//${parsed.hostname}${parsed.pathname}${
        sorted.toString() ? `?${sorted.toString()}` : ''
      }`;
    } catch {
      return url;
    }
  }
}