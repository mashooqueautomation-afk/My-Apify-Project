// packages/api/src/utils/cron.ts
import { parseExpression } from 'cron-parser';

export function getNextCronDate(cronExpr: string, timezone = 'UTC'): Date {
  try {
    const interval = parseExpression(cronExpr, {
      tz: timezone,
      currentDate: new Date(),
    });
    return interval.next().toDate();
  } catch {
    throw new Error(`Invalid cron expression: ${cronExpr}`);
  }
}

export function isValidCron(expr: string): boolean {
  try {
    parseExpression(expr);
    return true;
  } catch {
    return false;
  }
}
