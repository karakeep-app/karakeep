import dns from "node:dns/promises";
import { BlockList, isIP } from "node:net";

// Self-hosted TTS servers normally live on a private LAN or localhost, so
// unlike the crawler we can't block private ranges. We do block cloud
// instance-metadata endpoints (link-local 169.254.0.0/16 covers AWS, GCP,
// Azure and ECS task metadata; fd00:ec2::254 is AWS's IPv6 one), the classic
// SSRF target for stealing server credentials.
const blockedAddresses = new BlockList();
blockedAddresses.addSubnet("169.254.0.0", 16, "ipv4");
// IPv4-mapped and NAT64 forms of the same range.
blockedAddresses.addSubnet("::ffff:169.254.0.0", 112, "ipv6");
blockedAddresses.addSubnet("64:ff9b::a9fe:0", 112, "ipv6");
blockedAddresses.addAddress("fd00:ec2::254", "ipv6");

export class TtsUrlNotAllowedError extends Error {
  constructor() {
    super("This host is not allowed as a TTS server address");
    this.name = "TtsUrlNotAllowedError";
  }
}

function isBlockedAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) {
    return blockedAddresses.check(address, "ipv4");
  }
  if (family === 6) {
    return blockedAddresses.check(address, "ipv6");
  }
  return true;
}

/**
 * Throws TtsUrlNotAllowedError unless every address the URL's host resolves
 * to is outside the cloud-metadata ranges. Checks resolved addresses, not
 * the hostname string, so DNS aliases can't sneak past.
 */
export async function assertTtsUrlAllowed(url: string): Promise<void> {
  const parsed = new URL(url);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new TtsUrlNotAllowedError();
  }
  const hostname = parsed.hostname.replace(/^\[|\]$/g, "");
  const addresses = isIP(hostname)
    ? [hostname]
    : (await dns.lookup(hostname, { all: true, verbatim: true })).map(
        (a) => a.address,
      );
  if (addresses.length === 0 || addresses.some(isBlockedAddress)) {
    throw new TtsUrlNotAllowedError();
  }
}

/**
 * fetch() for user-configured TTS servers: validates the destination first
 * and refuses to follow redirects, since a redirect would land on a host
 * that was never checked.
 */
export async function ttsFetch(
  url: string,
  init: RequestInit = {},
): Promise<Response> {
  await assertTtsUrlAllowed(url);
  return fetch(url, { ...init, redirect: "error" });
}

/** Upstream error bodies are echoed to users; keep them short. */
export async function ttsErrorBody(response: Response): Promise<string> {
  const text = await response.text().catch(() => "");
  return text.length > 300 ? `${text.slice(0, 300)}…` : text;
}
