export interface RunJobData {
  runId: string;
  actorId: string;
  actorSlug: string;
  orgId: string;
  input: Record<string, any>;
  options: {
    dockerImage?: string;
    memoryMbytes?: number;
    timeoutSecs?: number;
    proxyGroupId?: string;
    maxRetries?: number;  // ← ADD THIS LINE
  };
}