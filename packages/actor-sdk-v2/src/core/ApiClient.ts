import pRetry from 'p-retry';
import { ActorError } from '../errors/ActorError';
import { Logger } from '../logging/Logger';

export interface ApiClientConfig {
  baseUrl: string;
  token: string;
  timeout?: number;
  maxRetries?: number;
  logger: Logger;
}

export class ApiClient {
  private baseUrl: string;
  private token: string;
  private timeout: number;
  private maxRetries: number;
  private logger: Logger;

  constructor(config: ApiClientConfig) {
    this.baseUrl = config.baseUrl;
    this.token = config.token;
    this.timeout = config.timeout || 30000;
    this.maxRetries = config.maxRetries || 3;
    this.logger = config.logger;
  }

  async request<T>(
    method: string,
    endpoint: string,
    body?: any,
    options?: { timeout?: number; retries?: number }
  ): Promise<T> {
    const url = `${this.baseUrl}/api/v1${endpoint}`;
    const timeout = options?.timeout || this.timeout;
    const retries = options?.retries ?? this.maxRetries;

    const makeRequest = async (): Promise<T> => {
      const controller = new AbortController();
      const timeoutHandle = setTimeout(() => controller.abort(), timeout);

      try {
        const response = await fetch(url, {
          method,
          headers: {
            'Authorization': `Bearer ${this.token}`,
            'Content-Type': 'application/json',
            'User-Agent': 'WebMiner-ActorSDK/2.0',
          },
          body: body ? JSON.stringify(body) : undefined,
          signal: controller.signal,
        });

        if (!response.ok) {
          const text = await response.text().catch(() => '');
          throw ActorError.api(response.status, text || response.statusText);
        }

        const contentType = response.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
          return await response.json() as T;
        }
        return await response.text() as T;
      } catch (err: any) {
        if (err instanceof ActorError) throw err;
        if (err?.name === 'AbortError') {
          throw ActorError.timeout(timeout / 1000);
        }
        throw ActorError.network(
          `${method} ${endpoint} failed: ${(err as Error).message}`,
          true
        );
      } finally {
        clearTimeout(timeoutHandle);
      }
    };

    try {
      return await pRetry(makeRequest, {
        retries,
        onFailedAttempt: (error: any) => {
          this.logger.warn(
            `API request failed (attempt ${error.attemptNumber}/${retries + 1})`,
            {
              method,
              endpoint,
              error: error.message,
              retriesLeft: error.retriesLeft,
            }
          );
        },
      });
    } catch (err: any) {
      if (err instanceof ActorError) throw err;
      throw ActorError.internal(`API request failed after ${retries} retries: ${err.message}`);
    }
  }

  post<T>(endpoint: string, body?: any): Promise<T> {
    return this.request<T>('POST', endpoint, body);
  }

  get<T>(endpoint: string): Promise<T> {
    return this.request<T>('GET', endpoint);
  }

  put<T>(endpoint: string, body?: any): Promise<T> {
    return this.request<T>('PUT', endpoint, body);
  }

  delete<T>(endpoint: string): Promise<T> {
    return this.request<T>('DELETE', endpoint);
  }
}