// packages/worker/src/types.ts
export interface RunJobData {
  runId: string;
  actorId: string;
  actorSlug: string;
  orgId: string;
  userId?: string;
  input: Record<string, any>;
  options: {
    memoryMbytes: number;
    timeoutSecs: number;
    dockerImage?: string;
    proxyGroupId?: string;
  };
}
