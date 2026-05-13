/**
 * Retry Strategy Service
 * Handles exponential backoff and retry logic
 */

export interface RetryConfig {
  maxRetries: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  jitterFactor: number; // 0-1: adds randomness
}

export class RetryStrategy {
  static readonly DEFAULT_CONFIG: RetryConfig = {
    maxRetries: 3,
    initialDelayMs: 1000, // 1 second
    maxDelayMs: 30000, // 30 seconds
    backoffMultiplier: 2, // exponential: 1s → 2s → 4s
    jitterFactor: 0.1, // 10% randomness
  };

  /**
   * Calculate delay for retry attempt (exponential backoff with jitter)
   */
  static calculateDelay(
    attemptNumber: number,
    config: Partial<RetryConfig> = {}
  ): number {
    const merged = { ...this.DEFAULT_CONFIG, ...config };

    // Exponential backoff: delay = initial * (multiplier ^ attempt)
    let delay =
      merged.initialDelayMs *
      Math.pow(merged.backoffMultiplier, attemptNumber);

    // Cap at max delay
    delay = Math.min(delay, merged.maxDelayMs);

    // Add jitter to prevent thundering herd
    const jitter = delay * merged.jitterFactor * (Math.random() - 0.5) * 2;
    delay = Math.max(1000, delay + jitter); // Never less than 1 second

    return Math.floor(delay);
  }

  /**
   * Should retry based on error type
   */
  static isRetryable(error: any): boolean {
    // Network errors: retryable
    if (error.code === 'ECONNREFUSED') return true;
    if (error.code === 'ECONNRESET') return true;
    if (error.code === 'ETIMEDOUT') return true;
    if (error.code === 'EHOSTUNREACH') return true;

    // HTTP 5xx: retryable
    if (error.statusCode >= 500) return true;

    // HTTP 429 (rate limit): retryable
    if (error.statusCode === 429) return true;

    // HTTP 503 (service unavailable): retryable
    if (error.statusCode === 503) return true;

    // HTTP 4xx (except 429): NOT retryable
    if (error.statusCode >= 400) return false;

    // Unknown: retryable (fail-safe)
    return true;
  }

  /**
   * Format retry history for logging
   */
  static formatRetryHistory(
    attempts: number,
    delayMs: number,
    nextAttempt: number,
    maxRetries: number
  ): string {
    return `Attempt ${attempts}/${maxRetries + 1} failed. Retrying in ${Math.round(delayMs / 1000)}s...`;
  }
}