from unittest.mock import AsyncMock

import pytest

from app import ProviderFailure
from network import public_source_url


@pytest.mark.asyncio
@pytest.mark.parametrize("url", ["http://127.0.0.1", "http://[::1]", "http://10.0.0.2", "http://169.254.169.254", "http://localhost", "file:///etc/passwd", "https://user:pass@example.com", "https://example.com:9999", "https://example.com/\n"])
async def test_forbids_internal_or_invalid_urls(url):
    with pytest.raises(ProviderFailure):
        await public_source_url(url, resolve=AsyncMock(return_value=[]))


@pytest.mark.asyncio
async def test_checks_all_resolved_addresses_and_documents_remote_resolution():
    public = (2, 1, 6, "", ("93.184.216.34", 443))
    private = (2, 1, 6, "", ("10.0.0.1", 443))
    with pytest.raises(ProviderFailure):
        await public_source_url("https://example.com", resolve=AsyncMock(return_value=[public, private]))
    assert await public_source_url("https://example.com", resolve=AsyncMock(return_value=[public])) == "https://example.com"
