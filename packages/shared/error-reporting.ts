export interface ErrorReportClient {
  reportProblem(params: {
    userId: string;
    userName: string;
    userEmail: string;
    message: string;
    debugInfo?: {
      userAgent?: string;
      url?: string;
      timestamp?: string;
      [key: string]: unknown;
    };
  }): Promise<void>;
}

export interface PluginProvider<T> {
  getClient(): Promise<T | null>;
}
