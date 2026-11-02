import { createTransport } from "nodemailer";

import { getTracer, withSpan } from "@karakeep/shared-server";
import serverConfig from "@karakeep/shared/config";
import type {
  ZProblemReportClientDiagnostics,
  ZProblemReportCategory,
} from "@karakeep/shared/types/problemReports";
import { escapeHtml } from "@karakeep/shared/utils/htmlUtils";

const tracer = getTracer("@karakeep/trpc");

function buildTransporter() {
  if (!serverConfig.email.smtp) {
    throw new Error("SMTP is not configured");
  }
  return createTransport({
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
}

type Transporter = ReturnType<typeof buildTransporter>;

type Fn<Args extends unknown[] = unknown[]> = (
  transport: Transporter,
  ...args: Args
) => Promise<void>;

interface TracingOptions {
  silentFail?: boolean;
}

function withTracing<Args extends unknown[]>(
  name: string,
  fn: Fn<Args>,
  options: TracingOptions = {},
) {
  return async (...args: Args): Promise<void> => {
    if (options.silentFail && !serverConfig.email.smtp) {
      return;
    }
    const transporter = buildTransporter();
    await withSpan(tracer, name, {}, () => fn(transporter, ...args));
  };
}

export const sendVerificationEmail = withTracing(
  "sendVerificationEmail",
  async (
    transporter: Transporter,
    email: string,
    name: string,
    verificationUrl: string,
  ) => {
    const mailOptions = {
      from: serverConfig.email.smtp!.from,
      to: email,
      subject: "Verify your email address",
      html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Welcome to Karakeep, ${escapeHtml(name)}!</h2>
        <p>Please verify your email address by clicking the link below:</p>
        <p>
          <a href="${verificationUrl}" style="background-color: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">
            Verify Email Address
          </a>
        </p>
        <p>If the button doesn't work, you can copy and paste this link into your browser:</p>
        <p><a href="${verificationUrl}">${verificationUrl}</a></p>
        <p>This link will expire in 24 hours.</p>
        <p>If you didn't create an account with us, please ignore this email.</p>
      </div>
    `,
      text: `
Welcome to Karakeep, ${name}!

Please verify your email address by visiting this link:
${verificationUrl}

This link will expire in 24 hours.

If you didn't create an account with us, please ignore this email.
    `,
    };

    await transporter.sendMail(mailOptions);
  },
);

export const sendInviteEmail = withTracing(
  "sendInviteEmail",
  async (
    transporter: Transporter,
    email: string,
    token: string,
    inviterName: string,
  ) => {
    const inviteUrl = `${serverConfig.publicUrl}/invite/${encodeURIComponent(token)}`;

    const mailOptions = {
      from: serverConfig.email.smtp!.from,
      to: email,
      subject: "You've been invited to join Karakeep",
      html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>You've been invited to join Karakeep!</h2>
        <p>${escapeHtml(inviterName)} has invited you to join Karakeep, the bookmark everything app.</p>
        <p>Click the link below to accept your invitation and create your account:</p>
        <p>
          <a href="${inviteUrl}" style="background-color: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">
            Accept Invitation
          </a>
        </p>
        <p>If the button doesn't work, you can copy and paste this link into your browser:</p>
        <p><a href="${inviteUrl}">${inviteUrl}</a></p>

        <p>If you weren't expecting this invitation, you can safely ignore this email.</p>
      </div>
    `,
      text: `
You've been invited to join Karakeep!

${inviterName} has invited you to join Karakeep, a powerful bookmarking and content organization platform.

Accept your invitation by visiting this link:
${inviteUrl}



If you weren't expecting this invitation, you can safely ignore this email.
    `,
    };

    await transporter.sendMail(mailOptions);
  },
);

export const sendPasswordResetEmail = withTracing(
  "sendPasswordResetEmail",
  async (
    transporter: Transporter,
    email: string,
    name: string,
    resetUrl: string,
  ) => {
    const mailOptions = {
      from: serverConfig.email.smtp!.from,
      to: email,
      subject: "Reset your password",
      html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Password Reset Request</h2>
        <p>Hi ${escapeHtml(name)},</p>
        <p>You requested to reset your password for your Karakeep account. Click the link below to reset your password:</p>
        <p>
          <a href="${resetUrl}" style="background-color: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">
            Reset Password
          </a>
        </p>
        <p>If the button doesn't work, you can copy and paste this link into your browser:</p>
        <p><a href="${resetUrl}">${resetUrl}</a></p>
        <p>This link will expire in 1 hour.</p>
        <p>If you didn't request a password reset, please ignore this email. Your password will remain unchanged.</p>
      </div>
    `,
      text: `
Hi ${name},

You requested to reset your password for your Karakeep account. Visit this link to reset your password:
${resetUrl}

This link will expire in 1 hour.

If you didn't request a password reset, please ignore this email. Your password will remain unchanged.
    `,
    };

    await transporter.sendMail(mailOptions);
  },
);

export const sendListInvitationEmail = withTracing(
  "sendListInvitationEmail",
  async (
    transporter: Transporter,
    email: string,
    inviterName: string,
    listName: string,
    listId: string,
  ) => {
    const inviteUrl = `${serverConfig.publicUrl}/dashboard/lists?pendingInvitation=${encodeURIComponent(listId)}`;

    const mailOptions = {
      from: serverConfig.email.smtp!.from,
      to: email,
      subject: `${inviterName} invited you to collaborate on "${listName}"`,
      html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>You've been invited to collaborate on a list!</h2>
        <p>${escapeHtml(inviterName)} has invited you to collaborate on the list <strong>"${escapeHtml(listName)}"</strong> in Karakeep.</p>
        <p>Click the link below to view and accept or decline the invitation:</p>
        <p>
          <a href="${inviteUrl}" style="background-color: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">
            View Invitation
          </a>
        </p>
        <p>If the button doesn't work, you can copy and paste this link into your browser:</p>
        <p><a href="${inviteUrl}">${inviteUrl}</a></p>
        <p>You can accept or decline this invitation from your Karakeep dashboard.</p>
        <p>If you weren't expecting this invitation, you can safely ignore this email or decline it in your dashboard.</p>
      </div>
    `,
      text: `
You've been invited to collaborate on a list!

${inviterName} has invited you to collaborate on the list "${listName}" in Karakeep.

View your invitation by visiting this link:
${inviteUrl}

You can accept or decline this invitation from your Karakeep dashboard.

If you weren't expecting this invitation, you can safely ignore this email or decline it in your dashboard.
    `,
    };

    await transporter.sendMail(mailOptions);
  },
  { silentFail: true },
);

export interface ProblemReportEmail {
  reportId: string;
  category: ZProblemReportCategory;
  description: string;
  reporter: {
    id: string;
    name?: string | null;
    email?: string | null;
    role?: string | null;
  };
  server: {
    version?: string;
    publicUrl: string;
    receivedAt: string;
  };
  diagnostics?: ZProblemReportClientDiagnostics;
}

const PROBLEM_REPORT_CATEGORY_LABELS: Record<ZProblemReportCategory, string> = {
  bug: "Something isn't working",
  content: "Bookmark content / crawling issue",
  performance: "Slowness or performance",
  account: "Account or login",
  other: "Other",
};

function problemReportSections(report: ProblemReportEmail) {
  const d = report.diagnostics;
  const fmt = (v: unknown) =>
    v === undefined || v === null || v === "" ? "—" : String(v);
  return {
    reporter: [
      ["User ID", report.reporter.id],
      ["Name", fmt(report.reporter.name)],
      ["Email", fmt(report.reporter.email)],
      ["Role", fmt(report.reporter.role)],
    ],
    server: [
      ["Report ID", report.reportId],
      ["Received at", report.server.receivedAt],
      ["Server version", fmt(report.server.version)],
      ["Instance URL", report.server.publicUrl],
    ],
    client: d
      ? [
          ["Page", fmt(d.pageUrl)],
          ["User agent", fmt(d.userAgent)],
          ["Language", fmt(d.language)],
          ["Timezone", fmt(d.timezone)],
          ["Viewport", fmt(d.viewport)],
          ["Screen", fmt(d.screen)],
          ["Pixel ratio", fmt(d.devicePixelRatio)],
          ["Theme", fmt(d.theme)],
          ["Online", fmt(d.online)],
          ["Client time", fmt(d.clientTimestamp)],
        ]
      : null,
    recentErrors: d?.recentErrors ?? [],
  };
}

function htmlTable(rows: string[][]) {
  return `<table style="border-collapse: collapse; width: 100%; font-size: 13px;">${rows
    .map(
      ([k, v]) =>
        `<tr><td style="padding: 4px 8px; color: #666; white-space: nowrap; vertical-align: top; border-bottom: 1px solid #eee;">${escapeHtml(k)}</td><td style="padding: 4px 8px; border-bottom: 1px solid #eee; word-break: break-all;">${escapeHtml(v)}</td></tr>`,
    )
    .join("")}</table>`;
}

function textTable(rows: string[][]) {
  return rows.map(([k, v]) => `  ${k}: ${v}`).join("\n");
}

export function buildProblemReportEmail(report: ProblemReportEmail) {
  const sections = problemReportSections(report);
  const categoryLabel = PROBLEM_REPORT_CATEGORY_LABELS[report.category];
  const firstLine = report.description.split(/\r?\n/)[0].trim().slice(0, 80);
  const subject = `[Karakeep problem report] ${categoryLabel}: ${firstLine}`;

  const errorsHtml =
    sections.recentErrors.length > 0
      ? sections.recentErrors
          .map(
            (e) =>
              `<div style="margin-bottom: 8px;"><div style="color: #666; font-size: 12px;">${escapeHtml(e.timestamp)}${e.source ? ` · ${escapeHtml(e.source)}` : ""}</div><pre style="margin: 2px 0 0; white-space: pre-wrap; word-break: break-all; background: #f6f6f6; padding: 6px; border-radius: 4px; font-size: 12px;">${escapeHtml(e.message)}</pre></div>`,
          )
          .join("")
      : `<p style="color: #666; font-size: 13px;">None captured.</p>`;

  const html = `
      <div style="font-family: Arial, sans-serif; max-width: 700px; margin: 0 auto;">
        <h2 style="margin-bottom: 4px;">New problem report</h2>
        <p style="margin-top: 0; color: #666;">${escapeHtml(categoryLabel)}</p>
        <h3>Description</h3>
        <div style="white-space: pre-wrap; background: #f6f6f6; padding: 12px; border-radius: 6px;">${escapeHtml(report.description)}</div>
        <h3>Reporter</h3>
        ${htmlTable(sections.reporter)}
        <h3>Server</h3>
        ${htmlTable(sections.server)}
        <h3>Browser</h3>
        ${sections.client ? htmlTable(sections.client) : `<p style="color: #666; font-size: 13px;">The user chose not to share browser diagnostics.</p>`}
        ${sections.client ? `<h3>Recent client errors</h3>${errorsHtml}` : ""}
        <p style="color: #999; font-size: 12px; margin-top: 24px;">Reply to this email to respond directly to the reporter.</p>
      </div>
    `;

  const errorsText =
    sections.recentErrors.length > 0
      ? sections.recentErrors
          .map(
            (e) =>
              `  [${e.timestamp}]${e.source ? ` (${e.source})` : ""} ${e.message}`,
          )
          .join("\n")
      : "  None captured.";

  const text = `
New problem report: ${categoryLabel}

Description:
${report.description}

Reporter:
${textTable(sections.reporter)}

Server:
${textTable(sections.server)}

Browser:
${sections.client ? textTable(sections.client) : "  The user chose not to share browser diagnostics."}
${sections.client ? `\nRecent client errors:\n${errorsText}\n` : ""}`;

  return { subject, html, text };
}

export const sendProblemReportEmail = withTracing(
  "sendProblemReportEmail",
  async (transporter: Transporter, report: ProblemReportEmail) => {
    const to = serverConfig.problemReports.email;
    if (!to) {
      throw new Error("PROBLEM_REPORTS_EMAIL is not configured");
    }
    const { subject, html, text } = buildProblemReportEmail(report);
    await transporter.sendMail({
      from: serverConfig.email.smtp!.from,
      to,
      replyTo: report.reporter.email ?? undefined,
      subject,
      html,
      text,
    });
  },
);
