export interface ProxyInfo {
  id: string;
  url: string;
  country?: string;
  usageCount: number;
  failCount: number;
  retired: boolean;
}

export interface ProxyManagerOptions {
  maxFailCount?: number;
}

export class ProxyManager {
  private proxies: ProxyInfo[] = [];

  private options: Required<ProxyManagerOptions>;

  constructor(options: ProxyManagerOptions = {}) {
    this.options = {
      maxFailCount: options.maxFailCount || 5,
    };
  }

  /**
   * Add proxy
   */
  addProxy(url: string, country?: string) {
    this.proxies.push({
      id: crypto.randomUUID(),
      url,
      country,
      usageCount: 0,
      failCount: 0,
      retired: false,
    });
  }

  /**
   * Get proxy
   */
  getProxy(country?: string): ProxyInfo | null {
    let available = this.proxies.filter(
      (p) => !p.retired
    );

    if (country) {
      available = available.filter(
        (p) => p.country === country
      );
    }

    if (available.length === 0) {
      return null;
    }

    available.sort(
      (a, b) => a.usageCount - b.usageCount
    );

    const proxy = available[0];

    proxy.usageCount++;

    return proxy;
  }

  /**
   * Mark proxy bad
   */
  markBad(proxyId: string): void {
    const proxy = this.proxies.find(
      (p) => p.id === proxyId
    );

    if (!proxy) {
      return;
    }

    proxy.failCount++;

    if (
      proxy.failCount >=
      this.options.maxFailCount
    ) {
      proxy.retired = true;
    }
  }

  /**
   * Retire proxy
   */
  retireProxy(proxyId: string): void {
    const proxy = this.proxies.find(
      (p) => p.id === proxyId
    );

    if (proxy) {
      proxy.retired = true;
    }
  }

  /**
   * Get stats
   */
  getStats() {
    return {
      total: this.proxies.length,
      active: this.proxies.filter(
        (p) => !p.retired
      ).length,
      retired: this.proxies.filter(
        (p) => p.retired
      ).length,
    };
  }
}