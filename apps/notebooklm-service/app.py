"""Private single-process adapter. Never expose this service to the public network."""
import asyncio
from contextlib import asynccontextmanager
import hashlib
import hmac
import json
import os
from pathlib import Path
import sqlite3
import time
from typing import Callable, Literal, Protocol
from uuid import UUID

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from starlette.responses import JSONResponse
from pydantic import BaseModel, Field


class Operation(BaseModel):
    operation_id: UUID
    user_id: str = Field(min_length=1, max_length=128)
    source_version: str = Field(min_length=1, max_length=128)
    source_type: Literal["article", "youtube"]
    url: str = Field(min_length=1, max_length=8192)
    text: str | None = Field(default=None, max_length=500000)
    prompt: str = Field(min_length=1, max_length=32768)


class ProviderFailure(Exception):
    def __init__(self, code: str):
        self.code = code if code in {"auth", "quota", "no_text", "too_large", "timeout"} else "provider"
        super().__init__(self.code)


Update = Callable[..., None]


class Engine(Protocol):
    async def run(self, operation: Operation, update: Update) -> None: ...
    async def recover(self, operations: list[dict], update: Callable) -> None: ...


class Store:
    def __init__(self, folder: Path):
        folder.mkdir(mode=0o700, parents=True, exist_ok=True)
        filename = folder / "operations.sqlite3"
        self.db = sqlite3.connect(filename)
        os.chmod(filename, 0o600)
        self.db.row_factory = sqlite3.Row
        self.db.execute("""CREATE TABLE IF NOT EXISTS operations (
            id TEXT PRIMARY KEY, fingerprint TEXT NOT NULL, input TEXT NOT NULL,
            status TEXT NOT NULL, full_text TEXT, markdown TEXT, error_code TEXT,
            notebook_id TEXT, updated_at REAL NOT NULL)""")
        self.db.commit()

    def get(self, operation_id: str):
        row = self.db.execute("SELECT * FROM operations WHERE id = ?", (operation_id,)).fetchone()
        return dict(row) if row else None

    def create(self, operation: Operation):
        body = operation.model_dump_json()
        fingerprint = hashlib.sha256(body.encode()).hexdigest()
        previous = self.get(str(operation.operation_id))
        if previous:
            if previous["fingerprint"] != fingerprint:
                raise HTTPException(409, "Operation ID already belongs to another input")
            return False
        with self.db:
            self.db.execute("INSERT INTO operations(id,fingerprint,input,status,updated_at) VALUES(?,?,?,?,?)",
                            (str(operation.operation_id), fingerprint, body, "pending", time.time()))
        return True

    def update(self, operation_id: str, **fields):
        allowed = {"status", "full_text", "markdown", "error_code", "notebook_id"}
        if not fields or not set(fields) <= allowed:
            raise ValueError("Invalid operation update")
        with self.db:
            assignments = ",".join(f"{name} = ?" for name in fields)
            self.db.execute(f"UPDATE operations SET {assignments}, updated_at = ? WHERE id = ?",
                            (*fields.values(), time.time(), operation_id))

    def recoverable(self):
        return [dict(row) for row in self.db.execute("SELECT * FROM operations WHERE status = 'pending' OR notebook_id IS NOT NULL")]

    def expire(self):
        with self.db:
            self.db.execute("DELETE FROM operations WHERE status != 'pending' AND notebook_id IS NULL AND updated_at < ?", (time.time() - 86400,))

    def result(self, operation_id: str):
        row = self.get(operation_id)
        if row is None:
            raise HTTPException(404, "Operation not found")
        return {key: row[key] for key in ("id", "status", "full_text", "markdown", "error_code", "notebook_id")}


def create_app(engine: Engine, folder: Path, token: str, concurrency=1, timeout=240.0):
    if not token or concurrency < 1 or timeout <= 0:
        raise ValueError("Token, positive concurrency and timeout required")
    store: Store
    slots = asyncio.Semaphore(concurrency)
    tasks: dict[str, asyncio.Task] = {}

    async def execute(operation: Operation):
        operation_id = str(operation.operation_id)
        try:
            async with asyncio.timeout(timeout):
                async with slots:
                    await engine.run(operation, lambda **fields: store.update(operation_id, **fields))
                    row = store.get(operation_id)
                    if not row["full_text"] or not row["markdown"] or not row["markdown"].strip():
                        raise ProviderFailure("no_text" if not row["full_text"] else "provider")
                    store.update(operation_id, status="success")
        except TimeoutError:
            store.update(operation_id, status="failure", error_code="timeout")
        except asyncio.CancelledError:
            store.update(operation_id, status="failure", error_code="cancelled")
            raise
        except ProviderFailure as exc:
            store.update(operation_id, status="failure", error_code=exc.code)
        except Exception:
            # Do not log exception messages: upstream errors can contain cookies or source text.
            store.update(operation_id, status="failure", error_code="provider")
        finally:
            tasks.pop(operation_id, None)

    @asynccontextmanager
    async def lifespan(_app):
        nonlocal store
        store = Store(folder)
        stale = store.recoverable()
        for row in stale:
            if row["status"] == "pending":
                store.update(row["id"], status="failure", error_code="cancelled")
        await engine.recover(stale, store.update)
        store.expire()
        yield
        pending = list(tasks.values())
        for task in pending:
            task.cancel()
        await asyncio.gather(*pending, return_exceptions=True)
        store.db.close()

    app = FastAPI(lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)

    @app.exception_handler(RequestValidationError)
    async def invalid_request(_request, _error):
        return JSONResponse({"detail": "Invalid request"}, status_code=422)

    async def authorize(request: Request):
        authorization = request.headers.get("authorization", "")
        if not hmac.compare_digest(authorization.encode(), ("Bearer " + token).encode()):
            raise HTTPException(401, "Unauthorized")

    @app.middleware("http")
    async def private_request(request: Request, call_next):
        # Authorize before parsing a body; reject overlarge bodies incrementally.
        authorization = request.headers.get("authorization", "")
        if not hmac.compare_digest(authorization.encode(), ("Bearer " + token).encode()):
            return JSONResponse({"detail": "Unauthorized"}, status_code=401)
        data = bytearray()
        try:
            async with asyncio.timeout(10):
                async for chunk in request.stream():
                    if len(data) + len(chunk) > 3_000_000:
                        return JSONResponse({"detail": "Request too large"}, status_code=413)
                    data.extend(chunk)
        except TimeoutError:
            return JSONResponse({"detail": "Request timeout"}, status_code=408)
        request._body = bytes(data)
        return await call_next(request)

    @app.get("/health", dependencies=[Depends(authorize)])
    async def health():
        return {"status": "ok"}

    @app.post("/operations", status_code=202, dependencies=[Depends(authorize)])
    async def start(operation: Operation):
        store.expire()
        if store.create(operation):
            operation_id = str(operation.operation_id)
            tasks[operation_id] = asyncio.create_task(execute(operation))
        return store.result(str(operation.operation_id))

    @app.get("/operations/{operation_id}", dependencies=[Depends(authorize)])
    async def status(operation_id: UUID):
        return store.result(str(operation_id))

    return app
