import { createTransport } from "nodemailer";

import type {
  ErrorReportClient,
  PluginProvider,
} from "@karakeep/shared/error-reporting";
import serverConfig from "@karakeep/shared/config";

class EmailErrorReportClient implements ErrorReportClient {
  async reportProblem(params: {
    userId: string;
    userName: string;
    userEmail: string;
    message: string;
  }): Promise<void> {
    if (!serverConfig.email.smtp || !serverConfig.email.supportEmail) {
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

    const mailOptions = {
      from: serverConfig.email.smtp.from,
      to: serverConfig.email.supportEmail,
      subject: `Problem Report from ${params.userName}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Problem Report</h2>
          <p><strong>From:</strong> ${params.userName} (${params.userEmail})</p>
          <p><strong>User ID:</strong> ${params.userId}</p>
          <hr style="border: 1px solid #eee; margin: 20px 0;">
          <h3>Message:</h3>
          <p style="white-space: pre-wrap;">${params.message}</p>
        </div>
      `,
      text: `
Problem Report

From: ${params.userName} (${params.userEmail})
User ID: ${params.userId}

Message:
${params.message}
      `,
    };

    await transporter.sendMail(mailOptions);
  }
}

export class EmailErrorReportProvider
  implements PluginProvider<ErrorReportClient>
{
  private client: ErrorReportClient | null = null;

  async getClient(): Promise<ErrorReportClient | null> {
    if (!this.client) {
      this.client = new EmailErrorReportClient();
    }
    return this.client;
  }
}
