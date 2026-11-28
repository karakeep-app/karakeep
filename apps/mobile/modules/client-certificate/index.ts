import { requireOptionalNativeModule } from "expo";

export interface ClientCertificateInfo {
  /** A short, human-readable name for the certificate (usually its CN). */
  subject: string;
  /** Milliseconds since the Unix epoch. Missing on iOS versions before 18. */
  expiresAt?: number;
}

interface ClientCertificateNativeModule {
  importCertificate(
    fileUri: string,
    password: string,
  ): Promise<ClientCertificateInfo>;
  getCertificate(): ClientCertificateInfo | null;
  removeCertificate(): void;
  setServerHost(host: string | null): void;
}

// Only implemented on iOS.
const native = requireOptionalNativeModule<ClientCertificateNativeModule>(
  "KarakeepClientCertificate",
);

export const isClientCertificateSupported = native !== null;

export type ClientCertificateImportError =
  | "wrong_password"
  | "invalid_file"
  | "unknown";

/**
 * Installs the certificate and private key from a PKCS#12 (.p12/.pfx) file as
 * the identity presented to the Karakeep server. Replaces any existing one.
 */
export async function importClientCertificate(
  fileUri: string,
  password: string,
): Promise<
  | { ok: true; certificate: ClientCertificateInfo }
  | { ok: false; error: ClientCertificateImportError }
> {
  if (!native) {
    return { ok: false, error: "unknown" };
  }
  try {
    const certificate = await native.importCertificate(fileUri, password);
    return { ok: true, certificate };
  } catch (e) {
    const code = (e as { code?: string }).code;
    if (code === "ERR_CERTIFICATE_WRONG_PASSWORD") {
      return { ok: false, error: "wrong_password" };
    }
    if (code === "ERR_CERTIFICATE_INVALID_FILE") {
      return { ok: false, error: "invalid_file" };
    }
    return { ok: false, error: "unknown" };
  }
}

export function getClientCertificate(): ClientCertificateInfo | null {
  return native?.getCertificate() ?? null;
}

export function removeClientCertificate(): void {
  native?.removeCertificate();
}

/**
 * Tells the native side which server the certificate belongs to. It is never
 * presented to any other host.
 */
export function setClientCertificateServer(address: string | undefined): void {
  if (!native) {
    return;
  }
  native.setServerHost(hostFromAddress(address));
}

export function hostFromAddress(address: string | undefined): string | null {
  // Not `new URL()`: React Native's implementation doesn't parse hostnames
  // reliably across versions.
  const match = address?.trim().match(/^https?:\/\/(\[[^\]]+\]|[^/:?#]+)/i);
  if (!match) {
    return null;
  }
  return match[1].replace(/^\[|\]$/g, "").toLowerCase();
}
