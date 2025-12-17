export interface ErrorReportClient {
  reportProblem(params: {
    userId: string;
    userName: string;
    userEmail: string;
    message: string;
  }): Promise<void>;
}

export interface PluginProvider<T> {
  getClient(): Promise<T | null>;
}
