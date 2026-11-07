import net from "node:net";

import serverConfig from "@karakeep/shared/config";

// Loopback and private-network ranges, used by the "private" keyword (and so by
// the default) in TRUSTED_PROXIES.
const PRIVATE_RANGES: [string, number, "ipv4" | "ipv6"][] = [
  ["127.0.0.0", 8, "ipv4"],
  ["10.0.0.0", 8, "ipv4"],
  ["172.16.0.0", 12, "ipv4"],
  ["192.168.0.0", 16, "ipv4"],
  ["::1", 128, "ipv6"],
  ["fc00::", 7, "ipv6"],
];

export function buildTrustedProxies(entries: string[]): net.BlockList {
  const list = new net.BlockList();
  for (const entry of entries) {
    if (entry === "none") {
      continue;
    }
    if (entry === "private") {
      for (const [address, prefix, type] of PRIVATE_RANGES) {
        list.addSubnet(address, prefix, type);
      }
      continue;
    }
    // Entries are validated as IPs or CIDR ranges when the config is parsed.
    const [address, prefix] = entry.split("/");
    const type = net.isIPv4(address) ? "ipv4" : "ipv6";
    if (prefix === undefined) {
      list.addAddress(address, type);
    } else {
      list.addSubnet(address, Number(prefix), type);
    }
  }
  return list;
}

/**
 * Parses one X-Forwarded-For entry, which proxies may write with a port
 * ("1.2.3.4:80", "[::1]:80") or brackets ("[::1]"). IPv4-mapped IPv6
 * addresses are returned as plain IPv4 so they key rate limits consistently.
 */
function parseAddress(entry: string): string | null {
  let address = entry.trim();
  const bracketed = /^\[([^\]]+)\](?::\d+)?$/.exec(address);
  if (bracketed) {
    address = bracketed[1];
  } else if (/^[\d.]+:\d+$/.test(address)) {
    address = address.slice(0, address.lastIndexOf(":"));
  }
  if (!net.isIP(address)) {
    return null;
  }
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address);
  return mapped ? mapped[1] : address;
}

let trustedProxies: net.BlockList | undefined;

/**
 * Works out a request's client IP from X-Forwarded-For.
 *
 * Every proxy appends the address of whoever connected to it, so only the
 * right-hand end of the header can be trusted: walk it from the right,
 * skipping trusted proxies, and the first other address is the client.
 * Anything a client puts in the header itself ends up to the left of that
 * and is ignored. Other client-IP headers (X-Real-IP, X-Client-IP, ...) are
 * never read, since any client can set them.
 *
 * Next.js only fills in X-Forwarded-For with the connecting address when the
 * header is missing, so on an instance exposed without a proxy, a client that
 * sends its own header can still pick its IP.
 */
export function getClientIp(
  headers: Headers | undefined,
  proxies: net.BlockList = (trustedProxies ??= buildTrustedProxies(
    serverConfig.trustedProxies,
  )),
): string | null {
  const forwardedFor = headers?.get("x-forwarded-for");
  if (!forwardedFor) {
    return null;
  }
  const entries = forwardedFor.split(",");
  let lastTrusted: string | null = null;
  for (let i = entries.length - 1; i >= 0; i--) {
    const address = parseAddress(entries[i]);
    if (!address) {
      // Unparsable values can only come from further left than the trusted
      // proxies have vouched for, so stop at the last trusted address.
      break;
    }
    if (!proxies.check(address, net.isIPv4(address) ? "ipv4" : "ipv6")) {
      return address;
    }
    lastTrusted = address;
  }
  // Every address was a trusted proxy (e.g. a client on the local network),
  // so the left-most one we could read is the client.
  return lastTrusted;
}
