export interface AutoscaledPoolOptions {
  minConcurrency?: number;
  maxConcurrency?: number;
  desiredConcurrency?: number;
  memoryLimitMb?: number;
}

export class AutoscaledPool {
  private currentConcurrency = 0;

  private options: Required<AutoscaledPoolOptions>;

  constructor(options: AutoscaledPoolOptions = {}) {
    this.options = {
      minConcurrency: options.minConcurrency || 1,
      maxConcurrency: options.maxConcurrency || 20,
      desiredConcurrency:
        options.desiredConcurrency || 5,
      memoryLimitMb:
        options.memoryLimitMb || 2048,
    };
  }

  /**
   * Get current concurrency
   */
  getConcurrency(): number {
    return this.currentConcurrency;
  }

  /**
   * Scale concurrency dynamically
   */
  scale(): number {
    const memoryUsageMb =
      process.memoryUsage().rss /
      1024 /
      1024;

    // Memory high → reduce concurrency
    if (
      memoryUsageMb >
      this.options.memoryLimitMb
    ) {
      this.currentConcurrency = Math.max(
        this.options.minConcurrency,
        this.currentConcurrency - 1
      );

      return this.currentConcurrency;
    }

    // Increase concurrency gradually
    if (
      this.currentConcurrency <
      this.options.desiredConcurrency
    ) {
      this.currentConcurrency++;
    }

    this.currentConcurrency = Math.min(
      this.currentConcurrency,
      this.options.maxConcurrency
    );

    return this.currentConcurrency;
  }

  /**
   * Run autoscaled task
   */
  async run(
    task: () => Promise<void>
  ): Promise<void> {
    this.scale();

    await task();
  }

  /**
   * Get stats
   */
  getStats() {
    return {
      concurrency: this.currentConcurrency,
      memoryMb: Math.round(
        process.memoryUsage().rss /
          1024 /
          1024
      ),
      desired:
        this.options.desiredConcurrency,
      max: this.options.maxConcurrency,
    };
  }
}