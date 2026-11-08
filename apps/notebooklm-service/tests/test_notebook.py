from contextlib import asynccontextmanager
from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from notebooklm.exceptions import AuthError, RateLimitError

from app import Operation, ProviderFailure
from notebook import NotebookEngine, PREFIX, youtube_url

BODY = "The complete original text and transcript of the source. " * 10


def operation(source_type="article", text=BODY):
    return Operation(operation_id=uuid4(), user_id="owner", source_version="version", source_type=source_type, url="https://youtu.be/abcdefghijk?t=12" if source_type == "youtube" else "https://example.com/article", text=text, prompt="Write a Russian Markdown summary")


def backend():
    client = SimpleNamespace(
        notebooks=SimpleNamespace(create=AsyncMock(return_value=SimpleNamespace(id="nb")), delete=AsyncMock(), list=AsyncMock(return_value=[])),
        sources=SimpleNamespace(add_url=AsyncMock(return_value=SimpleNamespace(id="src")), add_text=AsyncMock(return_value=SimpleNamespace(id="src")), get_fulltext=AsyncMock(return_value=SimpleNamespace(content=BODY))),
        chat=SimpleNamespace(ask=AsyncMock(return_value=SimpleNamespace(answer="# Summary"))),
    )
    @asynccontextmanager
    async def factory():
        yield client
    return client, factory


@pytest.mark.asyncio
async def test_article_text_ready_and_fulltext_saved_before_generation():
    client, factory = backend()
    state = {}
    async def ask(*args, **kwargs):
        assert state["full_text"] == BODY
        return SimpleNamespace(answer="# Summary")
    client.chat.ask.side_effect = ask
    op = operation()
    await NotebookEngine(factory, validate_url=AsyncMock()).run(op, lambda **fields: state.update(fields))
    client.sources.add_url.assert_awaited_once_with("nb", op.url, wait=True)
    client.sources.add_text.assert_not_awaited()
    assert state["markdown"] == "# Summary"
    assert state["notebook_id"] is None
    client.notebooks.create.assert_awaited_once_with(PREFIX + str(op.operation_id))


@pytest.mark.asyncio
async def test_youtube_url_normalization_and_actual_transcript():
    client, factory = backend()
    state = {}
    await NotebookEngine(factory, validate_url=AsyncMock()).run(operation("youtube", None), lambda **fields: state.update(fields))
    client.sources.add_url.assert_awaited_once_with("nb", "https://www.youtube.com/watch?v=abcdefghijk", wait=True)
    assert state["full_text"] == BODY
    client.chat.ask.assert_awaited_once()


@pytest.mark.asyncio
async def test_unavailable_fulltext_never_uses_description():
    client, factory = backend()
    client.sources.get_fulltext.return_value = SimpleNamespace(content="Video title")
    with pytest.raises(ProviderFailure, match="no_text"):
        await NotebookEngine(factory, validate_url=AsyncMock()).run(operation("youtube", None), lambda **fields: None)
    client.chat.ask.assert_not_awaited()
    client.notebooks.delete.assert_awaited_once_with("nb")


@pytest.mark.asyncio
async def test_import_failure_and_generation_failure():
    for phase in ["import", "generation"]:
        client, factory = backend()
        state = {}
        target = client.sources.add_url if phase == "import" else client.chat.ask
        target.side_effect = RuntimeError("private upstream details")
        with pytest.raises(RuntimeError):
            await NotebookEngine(factory, validate_url=AsyncMock()).run(operation("youtube", None), lambda **fields: state.update(fields))
        assert ("full_text" in state) == (phase == "generation")
        client.notebooks.delete.assert_awaited_once_with("nb")


@pytest.mark.asyncio
async def test_empty_generation_and_cleanup_failure():
    client, factory = backend()
    client.chat.ask.return_value = SimpleNamespace(answer=" ")
    client.notebooks.delete.side_effect = RuntimeError("connection failed")
    state = {}
    with pytest.raises(ProviderFailure):
        await NotebookEngine(factory, validate_url=AsyncMock()).run(operation(), lambda **fields: state.update(fields))
    assert state["full_text"] == BODY
    assert state["notebook_id"] == "nb"


@pytest.mark.asyncio
async def test_auth_and_quota_classification():
    for exception, code in [(AuthError("private"), "auth"), (RateLimitError("private"), "quota")]:
        client, factory = backend()
        client.notebooks.create.side_effect = exception
        with pytest.raises(ProviderFailure, match=code):
            await NotebookEngine(factory, validate_url=AsyncMock()).run(operation(), lambda **fields: None)


@pytest.mark.asyncio
async def test_recovery_only_deletes_known_operation_notebooks():
    client, factory = backend()
    op_id = str(uuid4())
    client.notebooks.list.return_value = [SimpleNamespace(id="owned", title=PREFIX + op_id), SimpleNamespace(id="other", title=PREFIX + str(uuid4())), SimpleNamespace(id="personal", title="Personal notes")]
    state = {}
    await NotebookEngine(factory, validate_url=AsyncMock()).recover([{"id": op_id}], lambda key, **fields: state.update(fields))
    client.notebooks.delete.assert_awaited_once_with("owned")
    assert state["notebook_id"] is None


@pytest.mark.asyncio
async def test_operations_are_isolated():
    client, factory = backend()
    first, second = operation(), operation()
    await NotebookEngine(factory, validate_url=AsyncMock()).run(first, lambda **fields: None)
    await NotebookEngine(factory, validate_url=AsyncMock()).run(second, lambda **fields: None)
    assert client.notebooks.create.await_args_list[0].args != client.notebooks.create.await_args_list[1].args


def test_youtube_rejects_untrusted_hosts_and_invalid_ids():
    for value in ["https://youtube.com.evil.test/watch?v=abcdefghijk", "https://localhost/watch?v=abcdefghijk", "file:///etc/passwd", "https://youtube.com/watch?v=bad", "https://user@youtube.com/watch?v=abcdefghijk"]:
        with pytest.raises(ProviderFailure):
            youtube_url(value)


@pytest.mark.asyncio
async def test_article_import_failure_uses_crawler_text():
    client, factory = backend()
    client.sources.add_url.side_effect = RuntimeError("URL not supported")
    state = {}
    await NotebookEngine(factory, validate_url=AsyncMock()).run(operation(), lambda **fields: state.update(fields))
    client.sources.add_text.assert_awaited_once_with("nb", "Article", BODY, wait=True)
    assert state["markdown"] == "# Summary"


@pytest.mark.asyncio
async def test_poor_crawl_text_does_not_prevent_url_import():
    client, factory = backend()
    state = {}
    await NotebookEngine(factory, validate_url=AsyncMock()).run(operation(text="Short crawl"), lambda **fields: state.update(fields))
    client.sources.add_url.assert_awaited_once()
    assert state["markdown"] == "# Summary"


def test_known_citations_are_removed_without_breaking_markdown_or_source_numbers():
    from notebook import clean_citations
    refs = [SimpleNamespace(citation_number=n) for n in [1, 2, 3]]
    text = "Вывод [1-3]. Факты: 2026, 95%, [2026]. [1](https://example.com) и [2][ref].\n[ref]: https://example.com\n`array[1]`\n```python\nx[2]\n```\n    code[3]\n"
    cleaned = clean_citations(text, refs)
    assert "[1-3]" not in cleaned
    assert "[2026]" in cleaned and "95%" in cleaned
    assert "[1](https://example.com)" in cleaned and "[2][ref]" in cleaned
    assert "`array[1]`" in cleaned and "x[2]" in cleaned and "code[3]" in cleaned
    assert clean_citations("Факт [99].", refs) == "Факт [99]."
    assert clean_citations("Факт [1].", []) == "Факт [1]."


@pytest.mark.asyncio
async def test_publishes_answer_with_known_notebook_citations_removed():
    client, factory = backend()
    client.chat.ask.return_value = SimpleNamespace(answer="## Главное за 30 секунд\nФакт [1].", references=[SimpleNamespace(citation_number=1)])
    state = {}
    await NotebookEngine(factory, validate_url=AsyncMock()).run(operation(), lambda **fields: state.update(fields))
    assert state["markdown"] == "## Главное за 30 секунд\nФакт."


@pytest.mark.asyncio
async def test_source_timeouts_and_explicit_processing_failures_have_safe_distinct_codes():
    from notebooklm.exceptions import SourceTimeoutError, SourceProcessingError, RPCTimeoutError
    for error, code in [(SourceTimeoutError("src", 1), "timeout"), (RPCTimeoutError("private"), "timeout"), (SourceProcessingError("src", message="private"), "no_text")]:
        client, factory = backend()
        client.sources.add_url.side_effect = error
        with pytest.raises(ProviderFailure, match=code):
            await NotebookEngine(factory, validate_url=AsyncMock()).run(operation("youtube", None), lambda **fields: None)
        client.notebooks.delete.assert_awaited_once()
