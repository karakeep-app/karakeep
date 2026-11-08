"""NotebookLM integration; one notebook per immutable operation."""
import asyncio
import re
from urllib.parse import parse_qs, urlsplit

from notebooklm import NotebookLMClient
from notebooklm.exceptions import AuthError, RateLimitError, SourceProcessingError, SourceTimeoutError, RPCTimeoutError

from app import Operation, ProviderFailure, Update
from network import public_source_url

PREFIX = "Karakeep summary "


def clean_citations(markdown, references):
    """Remove known NotebookLM citation markers, preserving code and real links."""
    numbers = {r.citation_number for r in references
               if isinstance(getattr(r, "citation_number", None), int)}
    if not numbers:
        return markdown

    def strip_text(text):
        def replace(match):
            values = []
            for part in match.group(1).split(","):
                bounds = re.split(r"[-–]", part.strip())
                start, end = int(bounds[0]), int(bounds[-1])
                if end < start or end - start > 1000:
                    return match.group(0)
                values.extend(range(start, end + 1))
            return "" if values and all(n in numbers for n in values) else match.group(0)
        cleaned = re.sub(r"(?<!!)\[(\d{1,5}(?:\s*[-–,]\s*\d{1,5})*)\](?![\[(:])", replace, text)
        return re.sub(r"[ \t]+(?=[.,;:!?])", "", cleaned)

    # Protect fenced/indented code, inline code, Markdown links and HTML tags.
    protected = re.compile(r"(^```[^\n]*\n[\s\S]*?^```[^\n]*$|^~~~[^\n]*\n[\s\S]*?^~~~[^\n]*$|^(?: {4}|\t)[^\n]*$|`+[^`\n]*`+|!?\[[^\]\n]*\]\([^\n]*?\)|<[^>\n]*>)", re.MULTILINE)
    result, offset = [], 0
    for match in protected.finditer(markdown):
        result.extend((strip_text(markdown[offset:match.start()]), match.group(0)))
        offset = match.end()
    result.append(strip_text(markdown[offset:]))
    return "".join(result).strip()


def youtube_url(value: str) -> str:
    parsed = urlsplit(value)
    if parsed.scheme not in {"http", "https"} or parsed.username or parsed.password or parsed.port not in {None, 80, 443}:
        raise ProviderFailure("no_text")
    host = (parsed.hostname or "").rstrip(".").lower()
    parts = parsed.path.strip("/").split("/")
    if host in {"youtu.be", "www.youtu.be"}:
        video_id = parts[0]
    elif host in {"youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com"}:
        if parsed.path == "/watch":
            video_id = parse_qs(parsed.query).get("v", [""])[0]
        elif len(parts) == 2 and parts[0] in {"shorts", "embed", "live"}:
            video_id = parts[1]
        else:
            raise ProviderFailure("no_text")
    else:
        raise ProviderFailure("no_text")
    if not re.fullmatch(r"[a-zA-Z0-9_-]{11}", video_id):
        raise ProviderFailure("no_text")
    return "https://www.youtube.com/watch?v=" + video_id


class NotebookEngine:
    def __init__(self, factory=None, max_chars=500000, validate_url=public_source_url):
        self.factory = factory or (lambda: NotebookLMClient.from_storage(
            rate_limit_max_retries=0, server_error_max_retries=0, allow_headless=True,
        ))
        self.max_chars = max_chars
        self.validate_url = validate_url

    def text(self, content: str) -> str:
        if not content or len(content.strip()) < 80:
            raise ProviderFailure("no_text")
        if len(content) > self.max_chars:
            raise ProviderFailure("too_large")
        return content

    async def cleanup(self, client, notebook_id, update):
        try:
            async with asyncio.timeout(10):
                await client.notebooks.delete(notebook_id)
            update(notebook_id=None)
        except Exception:
            # Keep the ID for recovery. Never leak Google's error message.
            pass

    async def run(self, operation: Operation, update: Update):
        if operation.source_type == "article" and operation.text:
            # Retain the source even if authentication or source import fails.
            try:
                update(full_text=self.text(operation.text))
            except ProviderFailure:
                pass  # A poor crawl result must not prevent importing the actual URL.
        try:
            async with self.factory() as client:
                notebook = await client.notebooks.create(PREFIX + str(operation.operation_id))
                update(notebook_id=notebook.id)
                try:
                    url = youtube_url(operation.url) if operation.source_type == "youtube" else operation.url
                    await self.validate_url(url)
                    try:
                        source = await client.sources.add_url(notebook.id, url, wait=True)
                    except (AuthError, RateLimitError):
                        raise
                    except Exception:
                        if operation.source_type != "article" or not operation.text:
                            raise
                        source = await client.sources.add_text(notebook.id, "Article", operation.text, wait=True)
                    # Source metadata/guide is never used as a transcript.
                    fulltext = await client.sources.get_fulltext(notebook.id, source.id)
                    update(full_text=self.text(fulltext.content))
                    answer = await client.chat.ask(notebook.id, operation.prompt, source_ids=[source.id])
                    if not answer.answer or not answer.answer.strip():
                        raise ProviderFailure("provider")
                    update(markdown=clean_citations(answer.answer, getattr(answer, "references", [])))
                finally:
                    await self.cleanup(client, notebook.id, update)
        except AuthError:
            raise ProviderFailure("auth") from None
        except RateLimitError:
            raise ProviderFailure("quota") from None
        except (SourceTimeoutError, RPCTimeoutError):
            raise ProviderFailure("timeout") from None
        except SourceProcessingError:
            raise ProviderFailure("no_text") from None

    async def recover(self, operations, update):
        if not operations:
            return
        known = {row["id"]: row for row in operations}
        try:
            async with self.factory() as client:
                async with asyncio.timeout(30):
                    notebooks = await client.notebooks.list()
                    for notebook in notebooks:
                        if not notebook.title.startswith(PREFIX):
                            continue
                        operation_id = notebook.title[len(PREFIX):]
                        if operation_id not in known:
                            continue
                        # Also finds a notebook created just before a crash prevented ID persistence.
                        update(operation_id, notebook_id=notebook.id)
                        await self.cleanup(client, notebook.id, lambda **fields: update(operation_id, **fields))
        except Exception:
            # Auth outages must not block serving retained fulltext for Hermes.
            pass
