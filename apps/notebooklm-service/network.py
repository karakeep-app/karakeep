"""Validate initial source URLs; fetching and redirects are performed by Google."""
import asyncio
import ipaddress
import socket
from urllib.parse import urlsplit

from app import ProviderFailure


async def public_source_url(value: str, resolve=None) -> str:
    try:
        parsed = urlsplit(value)
        host = parsed.hostname
        if (parsed.scheme not in {"http", "https"} or not host or parsed.username
                or parsed.password or parsed.port not in {None, 80, 443}
                or "\\" in value or any(ord(c) < 33 for c in value)):
            raise ValueError()
        host = host.rstrip(".").lower()
        if host == "localhost" or host.endswith((".localhost", ".local", ".internal")):
            raise ValueError()
        try:
            addresses = [ipaddress.ip_address(host)]
        except ValueError:
            lookup = resolve or asyncio.get_running_loop().getaddrinfo
            rows = await asyncio.wait_for(lookup(host, parsed.port or (443 if parsed.scheme == "https" else 80), type=socket.SOCK_STREAM), timeout=3)
            addresses = [ipaddress.ip_address(row[4][0]) for row in rows]
        if not addresses or any(not address.is_global for address in addresses):
            raise ValueError()
        return value
    except (ValueError, OSError, TimeoutError):
        raise ProviderFailure("no_text") from None
