export interface ActorContext {
  runId: string;
  actorId: string;
  orgId: string;
  datasetId?: string;
  requestQueueId?: string;
  kvsId?: string;
  apiUrl: string;
  apiToken: string;
  // Execution metadata
  maxRetries: number;
  requestTimeout: number;
  isLocal: boolean;
}

export interface PushDataOptions {
  batchSize?: number; // Default 500
  timeout?: number;
}

export interface RequestQueueItem {
  id?: string;
  url: string;
  userData?: Record<string, any>;
  priority?: number; // 0-100, higher = first
  retries?: number;
  headers?: Record<string, string>;
  method?: 'GET' | 'POST';
  body?: string;
}

export interface ActorErrorInterface extends Error {
  code: string;
  statusCode?: number;
  retryable: boolean;
  context?: Record<string, any>;
}

export interface LogEntry {
  timestamp: string; // ISO8601
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  requestId?: string;
  context?: Record<string, any>;
}

export interface DatasetPushResult {
  itemsAdded: number;
  batchCount: number;
  durationMs: number;
}

export interface RequestQueueStats {
  pending: number;
  processing: number;
  succeeded: number;
  failed: number;
}