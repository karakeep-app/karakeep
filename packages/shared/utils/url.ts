export function setUrlHostnameFromResolvedAddress(url: URL, address: string) {
  url.hostname = address.includes(":") ? `[${address}]` : address;
}
