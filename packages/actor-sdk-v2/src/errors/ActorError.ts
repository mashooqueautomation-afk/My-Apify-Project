export class ActorError extends Error {
  constructor(
    public message: string,
    public code: string,
    public retryable: boolean = false,
    public statusCode?: number,
    public context?: Record<string, any>
  ) {
    super(message);
    this.name = 'ActorError';
    Object.setPrototypeOf(this, ActorError.prototype);
  }

  static network(message: string, retryable = true) {
    return new ActorError(message, 'NETWORK_ERROR', retryable, undefined, {});
  }

  static api(statusCode: number, message: string) {
    const retryable = statusCode >= 500 || statusCode === 429;
    return new ActorError(message, 'API_ERROR', retryable, statusCode, {});
  }

  static timeout(seconds: number) {
    return new ActorError(
      `Operation timeout after ${seconds}s`,
      'TIMEOUT',
      true,
      undefined,
      { timeoutSeconds: seconds }
    );
  }

  static validation(message: string, field?: string) {
    return new ActorError(
      message,
      'VALIDATION_ERROR',
      false,
      400,
      { field }
    );
  }

  static internal(message: string) {
    return new ActorError(message, 'INTERNAL_ERROR', false, 500, {});
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      retryable: this.retryable,
      statusCode: this.statusCode,
      context: this.context,
    };
  }
}