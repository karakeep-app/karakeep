import os
from pathlib import Path

from app import create_app
from notebook import NotebookEngine


def make_app():
    return create_app(
        NotebookEngine(max_chars=int(os.environ.get("SUMMARY_MAX_SOURCE_CHARS", "500000"))),
        Path(os.environ.get("NOTEBOOKLM_STATE_DIR", "/state")),
        os.environ["SUMMARY_NOTEBOOKLM_TOKEN"],
        concurrency=int(os.environ.get("NOTEBOOKLM_CONCURRENCY", "1")),
        timeout=float(os.environ.get("SUMMARY_NOTEBOOKLM_TIMEOUT_SEC", "240")),
    )
