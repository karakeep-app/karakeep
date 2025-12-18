import { createTransport } from "nodemailer";

import type {
  ErrorReportClient,
  PluginProvider,
} from "@karakeep/shared/error-reporting";
import serverConfig from "@karakeep/shared/config";

import { envConfig } from "./env";

class EmailErrorReportClient implements ErrorReportClient {
  async reportProblem(params: {
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
  }): Promise<void> {
    if (!serverConfig.email.smtp || !envConfig.SUPPORT_EMAIL) {
      throw new Error("SMTP or support email is not configured");
    }

    const transporter = createTransport({
      host: serverConfig.email.smtp.host,
      port: serverConfig.email.smtp.port,
      secure: serverConfig.email.smtp.secure,
      auth:
        serverConfig.email.smtp.user && serverConfig.email.smtp.password
          ? {
              user: serverConfig.email.smtp.user,
              pass: serverConfig.email.smtp.password,
            }
          : undefined,
    });

    const debugInfoHtml = params.debugInfo
      ? `
          <hr style="border: 1px solid #eee; margin: 20px 0;">
          <h3>Debug Information:</h3>
          <pre style="background: #f5f5f5; padding: 10px; border-radius: 5px; overflow-x: auto;">${JSON.stringify(params.debugInfo, null, 2)}</pre>
        `
      : "";

    const debugInfoText = params.debugInfo
      ? `

Debug Information:
${JSON.stringify(params.debugInfo, null, 2)}
      `
      : "";

    const mailOptions = {
      from: serverConfig.email.smtp.from,
      to: envConfig.SUPPORT_EMAIL,
      subject: `Problem Report from ${params.userName}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Problem Report</h2>
          <p><strong>From:</strong> ${params.userName} (${params.userEmail})</p>
          <p><strong>User ID:</strong> ${params.userId}</p>
          <hr style="border: 1px solid #eee; margin: 20px 0;">
          <h3>Message:</h3>
          <p style="white-space: pre-wrap;">${params.message}</p>
          ${debugInfoHtml}
        </div>
      `,
      text: `
Problem Report

From: ${params.userName} (${params.userEmail})
User ID: ${params.userId}

Message:
${params.message}${debugInfoText}
      `,
    };

    await transporter.sendMail(mailOptions);
  }
}

export class EmailErrorReportProvider
  implements PluginProvider<ErrorReportClient>
{
  private client: ErrorReportClient | null = null;

  static isConfigured(): boolean {
    return envConfig.SUPPORT_EMAIL !== undefined;
  }

  async getClient(): Promise<ErrorReportClient | null> {
    if (!this.client) {
      this.client = new EmailErrorReportClient();
    }
    return this.client;
  }
}
