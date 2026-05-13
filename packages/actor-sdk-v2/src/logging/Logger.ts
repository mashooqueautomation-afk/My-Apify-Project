import pino from 'pino';
import { v4 as uuid } from 'uuid';

export class Logger {
  private logger: pino.Logger;
  private requestId: string;
  private context: Record<string, any> = {};

  constructor(
    private runId: string,
    private actorName: string,
    logLevel: string = 'info'
  ) {
    this.requestId = uuid().slice(0, 8);
    this.logger = pino({
      level: logLevel,
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
          singleLine: false,
          translateTime: 'SYS:standard',
        },
      },
    });
  }

  setContext(context: Record<string, any>) {
    this.context = { ...this.context, ...context };
  }

  private buildObject(message: string, data?: any) {
    const base = {
      runId: this.runId,
      actor: this.actorName,
      requestId: this.requestId,
      msg: message,
      ...this.context,
    };
    return data ? { ...base, data } : base;
  }

  debug(message: string, data?: any) {
    this.logger.debug(this.buildObject(message, data));
  }

  info(message: string, data?: any) {
    this.logger.info(this.buildObject(message, data));
  }

  warn(message: string, data?: any) {
    this.logger.warn(this.buildObject(message, data));
  }

  error(message: string, error?: Error | any, data?: any) {
    const errorData = error instanceof Error 
      ? { 
          errorName: error.name, 
          errorMessage: error.message,
          stack: error.stack 
        }
      : error;
    this.logger.error({ ...this.buildObject(message, data), ...errorData });
  }

  metric(metricName: string, value: number, unit?: string, tags?: Record<string, string>) {
    this.logger.info(
      this.buildObject(`METRIC: ${metricName}`, { value, unit, tags })
    );
  }
}

export function createLogger(runId: string, actorName: string): Logger {
  return new Logger(runId, actorName, process.env.LOG_LEVEL || 'info');
}