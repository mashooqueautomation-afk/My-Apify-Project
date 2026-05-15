export interface Session {
  id: string;
  cookies: any[];
  usageCount: number;
  errorScore: number;
  retired: boolean;
  createdAt: Date;
}

export interface SessionPoolOptions {
  maxPoolSize?: number;
  maxUsageCount?: number;
  maxErrorScore?: number;
}

export class SessionPool {
  private sessions: Session[] = [];

  private options: Required<SessionPoolOptions>;

  constructor(options: SessionPoolOptions = {}) {
    this.options = {
      maxPoolSize: options.maxPoolSize || 20,
      maxUsageCount: options.maxUsageCount || 50,
      maxErrorScore: options.maxErrorScore || 3,
    };
  }

  /**
   * Create new session
   */
  createSession(): Session {
    const session: Session = {
      id: crypto.randomUUID(),
      cookies: [],
      usageCount: 0,
      errorScore: 0,
      retired: false,
      createdAt: new Date(),
    };

    this.sessions.push(session);

    return session;
  }

  /**
   * Get active session
   */
  getSession(): Session {
    let session = this.sessions.find(
      (s) =>
        !s.retired &&
        s.usageCount < this.options.maxUsageCount &&
        s.errorScore < this.options.maxErrorScore
    );

    if (!session) {
      session = this.createSession();
    }

    session.usageCount++;

    return session;
  }

  /**
   * Mark session bad
   */
  markBad(sessionId: string): void {
    const session = this.sessions.find(
      (s) => s.id === sessionId
    );

    if (!session) {
      return;
    }

    session.errorScore++;

    if (
      session.errorScore >=
      this.options.maxErrorScore
    ) {
      session.retired = true;
    }
  }

  /**
   * Retire session
   */
  retireSession(sessionId: string): void {
    const session = this.sessions.find(
      (s) => s.id === sessionId
    );

    if (session) {
      session.retired = true;
    }
  }

  /**
   * Save cookies
   */
  saveCookies(
    sessionId: string,
    cookies: any[]
  ): void {
    const session = this.sessions.find(
      (s) => s.id === sessionId
    );

    if (!session) {
      return;
    }

    session.cookies = cookies;
  }

  /**
   * Get stats
   */
  getStats() {
    return {
      total: this.sessions.length,
      active: this.sessions.filter(
        (s) => !s.retired
      ).length,
      retired: this.sessions.filter(
        (s) => s.retired
      ).length,
    };
  }
}